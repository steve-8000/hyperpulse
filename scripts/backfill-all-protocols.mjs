#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const LIST_PATH = path.join(ROOT, "list.md");
const OUT_PATH = path.join(ROOT, "data", "backfill-progress.json");

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (ch === "," && !inQuote) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

async function loadProtocols() {
  const markdown = await fs.readFile(LIST_PATH, "utf8");
  const match = markdown.match(/```csv([\s\S]*?)```/m);
  if (!match) return [];
  const lines = match[1].split("\n").map((line) => line.trim()).filter(Boolean).slice(1);
  return lines.map((line) => parseCsvLine(line)[0]).filter(Boolean);
}

async function writeProgress(progress) {
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, `${JSON.stringify(progress, null, 2)}\n`);
}

async function loadExistingProgress() {
  try {
    const raw = await fs.readFile(OUT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rows)) return parsed;
  } catch {}
  return null;
}

async function fetchJsonWithWget(url, timeoutMs) {
  try {
    const timeoutSec = Math.max(30, Math.floor(timeoutMs / 1000));
    const { stdout } = await execFileAsync("wget", ["-qO-", `--timeout=${timeoutSec}`, url], {
      cwd: ROOT,
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
    });
    const text = stdout || "";
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    const ok = !body.error;
    return { ok, status: ok ? 200 : 500, body };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: { error: error?.message || String(error) },
    };
  }
}

async function run() {
  const protocols = await loadProtocols();
  const existing = await loadExistingProgress();
  const doneMap = new Map((existing?.rows || []).map((row) => [row.protocol, row]));

  const progress = {
    startedAt: existing?.startedAt || new Date().toISOString(),
    updatedAt: null,
    completedAt: null,
    status: "running",
    total: protocols.length,
    completed: 0,
    success: 0,
    failed: 0,
    rows: [],
  };

  for (const protocol of protocols) {
    const prev = doneMap.get(protocol);
    if (prev?.ok || prev?.attempts >= 2) {
      progress.rows.push(prev);
    }
  }
  progress.completed = progress.rows.length;
  progress.success = progress.rows.filter((r) => r.ok).length;
  progress.failed = progress.rows.filter((r) => !r.ok).length;
  await writeProgress(progress);

  for (const protocol of protocols) {
    if (progress.rows.some((row) => row.protocol === protocol && (row.ok || row.attempts >= 2))) {
      continue;
    }

    const row = { protocol, ok: false, attempts: 0 };
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      row.attempts = attempt;
      try {
        const result = await fetchJsonWithWget(`http://localhost:8080/api/client-review?protocol=${encodeURIComponent(protocol)}&backfill=5`, 90 * 1000);
        if (!result.ok) {
          row.error = result.body?.error || `HTTP ${result.status}`;
          continue;
        }
        row.ok = true;
        row.status = result.body?.status || "unknown";
        row.created = result.body?.backfill?.created || 0;
        row.skipped = result.body?.backfill?.skipped || 0;
        row.recent = Array.isArray(result.body?.recentReports) ? result.body.recentReports.length : 0;
        break;
      } catch (error) {
        row.error = error?.name === "AbortError" ? "timeout" : (error.message || String(error));
      }
    }

    progress.rows.push(row);
    progress.completed += 1;
    if (row.ok) progress.success += 1;
    else progress.failed += 1;
    progress.updatedAt = new Date().toISOString();
    await writeProgress(progress);
  }

  progress.status = "completed";
  progress.completedAt = new Date().toISOString();
  await writeProgress(progress);
}

run().catch(async (error) => {
  const fail = {
    status: "failed",
    error: error.message || String(error),
    failedAt: new Date().toISOString(),
  };
  await writeProgress(fail);
  process.exit(1);
});
