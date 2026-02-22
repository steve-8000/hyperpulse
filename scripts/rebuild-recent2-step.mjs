#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const LIST_PATH = path.join(ROOT, "list.md");
const DB_PATH = path.join(ROOT, "data", "review-db.json");
const REPORTS_DIR = path.join(ROOT, "reports");
const OUT_PATH = path.join(ROOT, "data", "backfill-summary-recent2-step.json");
const TARGET_PER_PROTOCOL = 2;
const MAX_CALLS_PER_PROTOCOL = 6;

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

async function fetchJson(url, timeoutMs = 1800000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    return JSON.parse(text || "{}");
  } finally {
    clearTimeout(timer);
  }
}

async function resetArtifacts() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.rm(DB_PATH, { force: true });
  await fs.rm(REPORTS_DIR, { recursive: true, force: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

async function run() {
  const protocols = await loadProtocols();
  await resetArtifacts();

  const summary = {
    startedAt: new Date().toISOString(),
    mode: "step",
    targetPerProtocol: TARGET_PER_PROTOCOL,
    totalProtocols: protocols.length,
    rows: [],
  };

  for (const protocol of protocols) {
    const row = {
      protocol,
      target: TARGET_PER_PROTOCOL,
      created: 0,
      calls: 0,
      status: "running",
      errors: [],
    };
    let idleCount = 0;
    while (row.created < TARGET_PER_PROTOCOL && row.calls < MAX_CALLS_PER_PROTOCOL) {
      row.calls += 1;
      const url = `http://localhost:8080/api/client-review?protocol=${encodeURIComponent(protocol)}&backfill=${TARGET_PER_PROTOCOL}&mode=step`;
      try {
        const body = await fetchJson(url);
        const created = Number(body?.backfill?.created || 0);
        const recentCount = Array.isArray(body?.recentReports) ? body.recentReports.length : 0;
        if (created > 0) {
          row.created += 1;
          idleCount = 0;
          continue;
        }
        idleCount += 1;
        if (recentCount >= TARGET_PER_PROTOCOL) break;
        if (idleCount >= 2) {
          row.status = "insufficient_history";
          row.message = body?.message || "추가 생성 항목 없음";
          break;
        }
      } catch (error) {
        row.errors.push(error.message || String(error));
      }
    }
    if (row.status === "running") row.status = row.created >= TARGET_PER_PROTOCOL ? "ok" : "partial";
    summary.rows.push(row);
    await fs.writeFile(OUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  }

  summary.completedAt = new Date().toISOString();
  await fs.writeFile(OUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
}

run().catch(async (error) => {
  const fail = {
    status: "failed",
    error: error.message || String(error),
    failedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.join(ROOT, "data"), { recursive: true });
  await fs.writeFile(OUT_PATH, `${JSON.stringify(fail, null, 2)}\n`);
  process.exit(1);
});
