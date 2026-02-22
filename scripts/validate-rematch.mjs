#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const LIST_PATH = path.join(ROOT, "list.md");
const REPORT_DIR = path.join(ROOT, "reports");
const APPLY_SAFE = process.argv.includes("--apply-safe");

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

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function parseMarkdownCsv(source) {
  const match = source.match(/```csv([\s\S]*?)```/m);
  if (!match) throw new Error("CSV block not found");
  const lines = match[1].trim().split("\n").map((v) => v.trim()).filter(Boolean);
  const rows = lines.slice(1).map((line, idx) => {
    const c = parseCsvLine(line);
    return {
      index: idx + 1,
      protocol: c[0] || "",
      website: c[1] || "",
      githubRepo: c[2] || "",
      dockerImage: c[3] || "",
      note: c[4] || "",
    };
  });
  return { block: match[0], rows };
}

function toGitHubUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  return `https://github.com/${value}`;
}

function parseGitHub(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

function dockerHubUrl(value) {
  if (!value) return null;
  if (/^https?:\/\/hub\.docker\.com\/r\//i.test(value)) return value.replace(/\/$/, "");
  if (/^https?:\/\//i.test(value)) return null;
  const m = value.match(/([a-z0-9._-]+\/[a-z0-9._-]+)/i);
  if (!m) return null;
  return `https://hub.docker.com/r/${m[1]}`;
}

function parseDockerHub(url) {
  const m = url.match(/hub\.docker\.com\/r\/([^/]+)\/([^/\s?#]+)/i);
  if (!m) return null;
  return { namespace: m[1], repository: m[2] };
}

async function fetchSafe(url, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      "user-agent": "hyperpulse-list-validator/2.0",
      ...(init.headers || {}),
    },
    redirect: "follow",
  });
}

async function checkGitHub(row) {
  const original = row.githubRepo;
  const target = toGitHubUrl(original);
  const parsed = parseGitHub(target);
  if (!parsed) {
    return { status: "invalid", original, canonical: original, note: "invalid github format", confidence: 0 };
  }

  const res = await fetchSafe(`https://github.com/${parsed.owner}/${parsed.repo}`);
  const canonical = res.url.replace(/\/$/, "");
  if (res.ok) {
    const redirected = canonical !== target;
    return {
      status: redirected ? "redirected" : "ok",
      original,
      canonical,
      note: redirected ? "resolved by redirect" : "reachable",
      confidence: redirected ? 1 : 0.99,
    };
  }
  return { status: `http-${res.status}`, original, canonical: target, note: "unreachable", confidence: 0 };
}

async function checkDocker(row) {
  const original = row.dockerImage;
  if (!original || /소스 빌드|없음|Dockerfile|활용/i.test(original)) {
    return { status: "manual", original, canonical: original, note: "manual image policy", confidence: 1 };
  }
  if (/ghcr\.io|gcr\.io|pkg\.dev/i.test(original)) {
    return { status: "external-registry", original, canonical: original, note: "non-dockerhub registry", confidence: 1 };
  }

  const hubUrl = dockerHubUrl(original);
  if (!hubUrl) {
    return { status: "manual", original, canonical: original, note: "non-hub docker value", confidence: 0.7 };
  }

  const parsed = parseDockerHub(hubUrl);
  if (!parsed) {
    return { status: "invalid", original, canonical: original, note: "invalid docker hub format", confidence: 0 };
  }

  const repoRes = await fetchSafe(`https://hub.docker.com/v2/repositories/${parsed.namespace}/${parsed.repository}/`);
  if (!repoRes.ok) {
    return { status: `http-${repoRes.status}`, original, canonical: hubUrl, note: "repository endpoint failed", confidence: 0 };
  }

  const tagsRes = await fetchSafe(`https://hub.docker.com/v2/repositories/${parsed.namespace}/${parsed.repository}/tags?page_size=1&ordering=last_updated`);
  return {
    status: tagsRes.ok ? "ok" : `repo-ok-tags-${tagsRes.status}`,
    original,
    canonical: hubUrl,
    note: tagsRes.ok ? "repo and tags reachable" : "repo reachable but tags limited",
    confidence: tagsRes.ok ? 0.99 : 0.9,
  };
}

function summarize(results) {
  const github = {};
  const docker = {};
  let fixable = 0;
  for (const r of results) {
    github[r.github.status] = (github[r.github.status] || 0) + 1;
    docker[r.docker.status] = (docker[r.docker.status] || 0) + 1;
    if (r.applyFix) fixable += 1;
  }
  return { total: results.length, github, docker, fixable };
}

function buildCsv(rows) {
  const header = "Protocol,Official Website,Official GitHub Repository,Recommended Docker Image,Note";
  const body = rows.map((r) => [r.protocol, r.website, r.githubRepo, r.dockerImage, r.note].map(csvEscape).join(",")).join("\n");
  return `${header}\n${body}`;
}

async function main() {
  const source = await fs.readFile(LIST_PATH, "utf8");
  const parsed = parseMarkdownCsv(source);

  const results = [];
  for (const row of parsed.rows) {
    const [github, docker] = await Promise.all([checkGitHub(row), checkDocker(row)]);
    const applyGithub = github.status === "redirected" && github.confidence >= 0.99;
    const fixed = {
      ...row,
      githubRepo: applyGithub ? github.canonical.replace("https://github.com/", "") : row.githubRepo,
      dockerImage: row.dockerImage,
    };
    results.push({ row, github, docker, fixedRow: fixed, applyFix: applyGithub });
  }

  const fixedRows = results.map((r) => r.fixedRow);
  const fixedCsv = buildCsv(fixedRows);
  const updatedMd = source.replace(parsed.block, `\`\`\`csv\n${fixedCsv}\n\`\`\``);

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, "live-validation-report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), summary: summarize(results), results }, null, 2));
  await fs.writeFile(path.join(REPORT_DIR, "list.rematched.csv"), `${fixedCsv}\n`);
  await fs.writeFile(path.join(REPORT_DIR, "list.rematched.md"), updatedMd);
  if (APPLY_SAFE) {
    await fs.writeFile(LIST_PATH, updatedMd);
  }

  console.log(JSON.stringify({ summary: summarize(results), applySafeEnabled: APPLY_SAFE, reportDir: REPORT_DIR }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
