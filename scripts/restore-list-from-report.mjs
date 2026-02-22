#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const LIST_PATH = path.join(ROOT, "list.md");
const REPORT_PATH = path.join(ROOT, "reports", "live-validation-report.json");

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(rows) {
  const header = "Chain,Client Name,Role,Language,GitHub Repository,Docker Hub Image";
  const body = rows
    .map((r) => [r.chain, r.clientName, r.role, r.language, r.githubRepo, r.dockerImage].map(csvEscape).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

async function main() {
  const [listMd, reportRaw] = await Promise.all([
    fs.readFile(LIST_PATH, "utf8"),
    fs.readFile(REPORT_PATH, "utf8"),
  ]);

  const report = JSON.parse(reportRaw);
  if (!Array.isArray(report.results) || report.results.length === 0) {
    throw new Error("No results in live-validation-report.json");
  }

  const originalRows = report.results.map((entry) => entry.row);
  const csv = buildCsv(originalRows);

  const block = listMd.match(/```csv([\s\S]*?)```/m);
  if (!block) throw new Error("CSV block not found in list.md");

  const restored = listMd.replace(block[0], `\`\`\`csv\n${csv}\n\`\`\``);
  await fs.writeFile(LIST_PATH, restored);

  console.log(JSON.stringify({ restoredRows: originalRows.length, listPath: LIST_PATH }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
