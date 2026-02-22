#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const LIST_PATH = path.join(ROOT, "list.md");
const OUT_DIR = path.join(ROOT, "data");
const OUT_PATH = path.join(OUT_DIR, "snapshot.json");
const STATE_PATH = path.join(OUT_DIR, "snapshot-state.json");
const USER_AGENT = "hyperpulse-snapshot/2.0";
const DEFAULT_BATCH_SIZE = Number.parseInt(process.env.SNAPSHOT_BATCH_SIZE || "1", 10);

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

function parseRows(markdown) {
  const match = markdown.match(/```csv([\s\S]*?)```/m);
  if (!match) throw new Error("CSV block not found in list.md");
  const lines = match[1].split("\n").map((v) => v.trim()).filter(Boolean);
  return lines.slice(1).map((line) => {
    const c = parseCsvLine(line);
    return {
      protocol: c[0] || "",
      githubRepo: c[2] || "",
      dockerImage: c[3] || "",
    };
  });
}

function parseGithubRepo(value) {
  if (!value) return null;
  const text = value.replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "");
  const m = text.match(/^([^/]+)\/([^/\s?#]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

function extractTagFromTitle(title) {
  if (!title) return null;
  const m = title.match(/v?\d+\.\d+(?:\.\d+)?(?:[-+._a-zA-Z0-9]*)?/);
  return m ? m[0] : title.trim();
}

function decodeXml(text) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function parseAtom(xml) {
  const entry = xml.match(/<entry[\s\S]*?<\/entry>/i)?.[0];
  if (!entry) return { version: null, updatedAt: null };
  const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const updated = entry.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] || null;
  const cleanTitle = decodeXml(title.replace(/<[^>]+>/g, "").trim());
  return { version: extractTagFromTitle(cleanTitle), updatedAt: updated };
}

async function fetchGithubMeta(githubRepo) {
  const parsed = parseGithubRepo(githubRepo);
  if (!parsed) return { githubVersion: null, githubUpdatedAt: null };

  const url = `https://github.com/${parsed.owner}/${parsed.repo}/releases.atom`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) return { githubVersion: null, githubUpdatedAt: null };

  const xml = await res.text();
  const parsedAtom = parseAtom(xml);
  return {
    githubVersion: parsedAtom.version,
    githubUpdatedAt: parsedAtom.updatedAt,
  };
}

function chooseUpdatedAt(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

async function readJsonOrNull(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeExistingMap(payload) {
  const map = new Map();
  for (const item of payload?.items || []) {
    if (!item?.protocol) continue;
    map.set(item.protocol, {
      protocol: item.protocol,
      version: item.version ?? null,
      updatedAt: item.updatedAt ?? null,
      githubVersion: item.githubVersion ?? null,
      githubUpdatedAt: item.githubUpdatedAt ?? null,
      dockerTag: item.dockerTag ?? null,
      dockerUpdatedAt: item.dockerUpdatedAt ?? null,
      dockerRegistry: item.dockerRegistry ?? null,
      dockerUiUrl: item.dockerUiUrl ?? null,
      dockerProbeUrl: item.dockerProbeUrl ?? null,
      dockerHttpStatus: item.dockerHttpStatus ?? null,
      dockerStatus: item.dockerStatus ?? null,
      dockerReason: item.dockerReason ?? null,
      dockerLinkVisible: item.dockerLinkVisible ?? false,
      checkedAt: item.checkedAt ?? null,
    });
  }
  return map;
}

function sanitizeBatchSize(value, total) {
  if (!Number.isFinite(value) || value < 1) return 1;
  if (value > total) return total;
  return Math.floor(value);
}

function pickRotation(rows, cursor, batchSize) {
  const total = rows.length;
  const start = ((cursor % total) + total) % total;
  const end = start + batchSize;
  const selected = [];

  for (let i = start; i < end; i += 1) {
    selected.push(rows[i % total]);
  }

  return { selected, nextCursor: end % total, start };
}

function isManualDockerValue(raw) {
  if (!raw) return true;
  const text = raw.trim();
  if (!text) return true;
  if (/^\(/.test(text)) return true;
  return /소스 빌드|없음|활용|dockerfile/i.test(text);
}

function parseDockerRef(raw) {
  if (isManualDockerValue(raw)) {
    return { kind: "manual", raw, token: null };
  }

  const token = raw.trim().split(/\s+/)[0];
  if (!token || /\.\.\./.test(token)) {
    return { kind: "invalid", raw, token };
  }

  const cleaned = token.replace(/^https?:\/\//i, "");

  const ghcr = cleaned.match(/^ghcr\.io\/([^/]+)\/([^/\s?#]+)$/i);
  if (ghcr) {
    return {
      kind: "ghcr",
      raw,
      token,
      owner: ghcr[1],
      image: ghcr[2],
      path: `${ghcr[1]}/${ghcr[2]}`,
    };
  }

  const gcr = cleaned.match(/^([a-z]+\.gcr\.io|gcr\.io)\/(.+)$/i);
  if (gcr) {
    return {
      kind: "gcr",
      raw,
      token,
      host: gcr[1],
      path: gcr[2],
      project: gcr[2].split("/")[0] || null,
    };
  }

  const pkg = cleaned.match(/^([a-z0-9.-]+\.pkg\.dev)\/(.+)$/i);
  if (pkg) {
    return {
      kind: "pkgdev",
      raw,
      token,
      host: pkg[1],
      path: pkg[2],
      project: pkg[2].split("/")[0] || null,
    };
  }

  const dockerHub = cleaned.match(/^([a-z0-9._-]+\/[a-z0-9._-]+)$/i);
  if (dockerHub) {
    return {
      kind: "dockerhub",
      raw,
      token,
      namespaceRepo: dockerHub[1],
    };
  }

  return { kind: "invalid", raw, token };
}

function dockerCandidates(ref) {
  if (ref.kind === "dockerhub") {
    return {
      probe: [`https://hub.docker.com/v2/repositories/${ref.namespaceRepo}/`],
      ui: [`https://hub.docker.com/r/${ref.namespaceRepo}`],
    };
  }

  if (ref.kind === "ghcr") {
    const q = encodeURIComponent(`ghcr.io/${ref.path}`);
    return {
      probe: [
        `https://ghcr.io/token?scope=repository:${ref.path}:pull`,
        `https://ghcr.io/v2/${ref.path}/tags/list?n=1`,
      ],
      ui: [
        `https://github.com/orgs/${ref.owner}/packages`,
        `https://github.com/${ref.owner}?tab=packages`,
        `https://github.com/search?q=${q}&type=packages`,
      ],
    };
  }

  if (ref.kind === "gcr") {
    return {
      probe: [`https://${ref.host}/v2/${ref.path}/tags/list`],
      ui: ref.project
        ? [
            `https://${ref.host}/v2/${ref.path}/tags/list`,
            `https://console.cloud.google.com/gcr?project=${ref.project}`,
          ]
        : [`https://${ref.host}/v2/${ref.path}/tags/list`],
    };
  }

  if (ref.kind === "pkgdev") {
    return {
      probe: [`https://${ref.host}/v2/${ref.path}/tags/list`],
      ui: ref.project
        ? [
            `https://${ref.host}/v2/${ref.path}/tags/list`,
            `https://console.cloud.google.com/artifacts?project=${ref.project}`,
          ]
        : [`https://${ref.host}/v2/${ref.path}/tags/list`],
    };
  }

  return { probe: [], ui: [] };
}

async function probeUrl(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        ...headers,
      },
    });
    clearTimeout(timer);
    return { status: res.status, ok: res.ok };
  } catch (error) {
    clearTimeout(timer);
    if (error?.name === "AbortError") return { status: 0, ok: false, timeout: true };
    return { status: 0, ok: false, timeout: false };
  }
}

async function fetchDockerHubTag(namespaceRepo) {
  const url = `https://hub.docker.com/v2/repositories/${namespaceRepo}/tags?page_size=1&ordering=last_updated`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) return { dockerTag: null, dockerUpdatedAt: null };
  const data = await res.json().catch(() => null);
  const tag = data?.results?.[0];
  return {
    dockerTag: tag?.name || null,
    dockerUpdatedAt: tag?.last_updated || null,
  };
}

async function fetchGhcrTag(pathRef) {
  const tokenRes = await fetch(`https://ghcr.io/token?scope=repository:${pathRef}:pull`, {
    headers: { "user-agent": USER_AGENT },
  });
  if (!tokenRes.ok) return { dockerTag: null, dockerUpdatedAt: null, tokenStatus: tokenRes.status };

  const token = (await tokenRes.json().catch(() => null))?.token;
  if (!token) return { dockerTag: null, dockerUpdatedAt: null, tokenStatus: 0 };

  const tagsRes = await fetch(`https://ghcr.io/v2/${pathRef}/tags/list?n=1`, {
    headers: {
      "user-agent": USER_AGENT,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!tagsRes.ok) return { dockerTag: null, dockerUpdatedAt: null, tokenStatus: tagsRes.status };

  const data = await tagsRes.json().catch(() => null);
  return {
    dockerTag: data?.tags?.[0] || null,
    dockerUpdatedAt: null,
    tokenStatus: 200,
  };
}

function statusFromHttp(status) {
  if (status >= 200 && status < 300) return "public";
  if (status === 401 || status === 403) return "restricted";
  if (status === 404) return "broken";
  if (status === 0 || status === 429 || status >= 500) return "transient";
  return "unknown";
}

async function fetchDockerMeta(rawDocker, previous) {
  const ref = parseDockerRef(rawDocker);

  if (ref.kind === "manual") {
    return {
      dockerRegistry: "manual",
      dockerUiUrl: null,
      dockerProbeUrl: null,
      dockerHttpStatus: null,
      dockerStatus: "manual",
      dockerReason: "manual-or-source-build",
      dockerLinkVisible: false,
      dockerTag: null,
      dockerUpdatedAt: null,
    };
  }

  if (ref.kind === "invalid") {
    return {
      dockerRegistry: "invalid",
      dockerUiUrl: null,
      dockerProbeUrl: null,
      dockerHttpStatus: null,
      dockerStatus: "invalid",
      dockerReason: "unparsed-docker-reference",
      dockerLinkVisible: false,
      dockerTag: null,
      dockerUpdatedAt: null,
    };
  }

  let dockerTag = null;
  let dockerUpdatedAt = null;

  if (ref.kind === "dockerhub") {
    const meta = await fetchDockerHubTag(ref.namespaceRepo).catch(() => ({ dockerTag: null, dockerUpdatedAt: null }));
    dockerTag = meta.dockerTag;
    dockerUpdatedAt = meta.dockerUpdatedAt;
  }

  if (ref.kind === "ghcr") {
    const meta = await fetchGhcrTag(ref.path).catch(() => ({ dockerTag: null, dockerUpdatedAt: null }));
    dockerTag = meta.dockerTag;
    dockerUpdatedAt = meta.dockerUpdatedAt;
  }

  const candidates = dockerCandidates(ref);
  let selectedHttp = null;
  let selectedStatus = "broken";
  let selectedUi = null;
  let selectedProbe = candidates.probe[0] || candidates.ui[0] || null;

  if (ref.kind === "ghcr") {
    const tokenProbe = await probeUrl(candidates.probe[0]);
    selectedHttp = tokenProbe.status;
    selectedStatus = statusFromHttp(tokenProbe.status);

    if (tokenProbe.ok) {
      const ghcrProbe = await probeUrl(candidates.probe[1], {
        Accept: "application/json",
      });
      selectedHttp = ghcrProbe.status;
      selectedStatus = statusFromHttp(ghcrProbe.status);
      selectedProbe = candidates.probe[1];
    }
  } else if (candidates.probe.length > 0) {
    const probe = await probeUrl(candidates.probe[0]);
    selectedHttp = probe.status;
    selectedStatus = statusFromHttp(probe.status);
  }

  for (const ui of candidates.ui) {
    const uiProbe = await probeUrl(ui);
    const uiStatus = statusFromHttp(uiProbe.status);
    if (uiStatus === "public" || uiStatus === "restricted") {
      selectedUi = ui;
      if (selectedStatus === "broken" || selectedStatus === "unknown") {
        selectedStatus = uiStatus;
        selectedHttp = uiProbe.status;
      }
      break;
    }
  }

  if (!selectedUi && candidates.ui.length > 0) {
    selectedUi = candidates.ui[candidates.ui.length - 1];
  }

  if (selectedStatus === "transient" && previous && (previous.dockerStatus === "public" || previous.dockerStatus === "restricted")) {
    return {
      dockerRegistry: previous.dockerRegistry,
      dockerUiUrl: previous.dockerUiUrl,
      dockerProbeUrl: previous.dockerProbeUrl,
      dockerHttpStatus: previous.dockerHttpStatus,
      dockerStatus: previous.dockerStatus,
      dockerReason: "transient-keep-last-good",
      dockerLinkVisible: previous.dockerLinkVisible,
      dockerTag: dockerTag || previous.dockerTag || null,
      dockerUpdatedAt: dockerUpdatedAt || previous.dockerUpdatedAt || null,
    };
  }

  return {
    dockerRegistry: ref.kind,
    dockerUiUrl: selectedStatus === "broken" ? null : selectedUi,
    dockerProbeUrl: selectedProbe,
    dockerHttpStatus: selectedHttp,
    dockerStatus: selectedStatus,
    dockerReason: `${ref.kind}-${selectedStatus}`,
    dockerLinkVisible: selectedStatus === "public" || selectedStatus === "restricted",
    dockerTag,
    dockerUpdatedAt,
  };
}

async function main() {
  const markdown = await fs.readFile(LIST_PATH, "utf8");
  const rows = parseRows(markdown);
  if (rows.length === 0) throw new Error("No rows found in list.md CSV");

  await fs.mkdir(OUT_DIR, { recursive: true });

  const [existingSnapshot, existingState] = await Promise.all([
    readJsonOrNull(OUT_PATH),
    readJsonOrNull(STATE_PATH),
  ]);

  const itemMap = normalizeExistingMap(existingSnapshot);
  const batchSize = sanitizeBatchSize(DEFAULT_BATCH_SIZE, rows.length);
  const cursor = Number.isInteger(existingState?.cursor) ? existingState.cursor : 0;
  const rotation = pickRotation(rows, cursor, batchSize);

  for (const row of rotation.selected) {
    const previous = itemMap.get(row.protocol);

    const [gh, docker] = await Promise.all([
      fetchGithubMeta(row.githubRepo).catch(() => ({ githubVersion: null, githubUpdatedAt: null })),
      fetchDockerMeta(row.dockerImage, previous).catch(() => ({
        dockerRegistry: "unknown",
        dockerUiUrl: null,
        dockerProbeUrl: null,
        dockerHttpStatus: 0,
        dockerStatus: "transient",
        dockerReason: "docker-meta-error",
        dockerLinkVisible: false,
        dockerTag: null,
        dockerUpdatedAt: null,
      })),
    ]);

    const version = gh.githubVersion || docker.dockerTag || previous?.version || null;
    const updatedAt = chooseUpdatedAt(gh.githubUpdatedAt, docker.dockerUpdatedAt) || previous?.updatedAt || null;

    itemMap.set(row.protocol, {
      protocol: row.protocol,
      version,
      updatedAt,
      githubVersion: gh.githubVersion,
      githubUpdatedAt: gh.githubUpdatedAt,
      dockerTag: docker.dockerTag,
      dockerUpdatedAt: docker.dockerUpdatedAt,
      dockerRegistry: docker.dockerRegistry,
      dockerUiUrl: docker.dockerUiUrl,
      dockerProbeUrl: docker.dockerProbeUrl,
      dockerHttpStatus: docker.dockerHttpStatus,
      dockerStatus: docker.dockerStatus,
      dockerReason: docker.dockerReason,
      dockerLinkVisible: docker.dockerLinkVisible,
      checkedAt: new Date().toISOString(),
    });
  }

  const items = rows.map((row) => {
    const existing = itemMap.get(row.protocol);
    return existing || {
      protocol: row.protocol,
      version: null,
      updatedAt: null,
      githubVersion: null,
      githubUpdatedAt: null,
      dockerTag: null,
      dockerUpdatedAt: null,
      dockerRegistry: null,
      dockerUiUrl: null,
      dockerProbeUrl: null,
      dockerHttpStatus: null,
      dockerStatus: null,
      dockerReason: null,
      dockerLinkVisible: false,
      checkedAt: null,
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    total: items.length,
    items,
  };

  const state = {
    cursor: rotation.nextCursor,
    batchSize,
    total: rows.length,
    lastRunAt: payload.generatedAt,
    lastWindowStart: rotation.start,
    lastWindowSize: rotation.selected.length,
    lastProtocols: rotation.selected.map((row) => row.protocol),
  };

  await Promise.all([
    fs.writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`),
    fs.writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`),
  ]);

  console.log(JSON.stringify({
    outPath: OUT_PATH,
    statePath: STATE_PATH,
    total: items.length,
    generatedAt: payload.generatedAt,
    batchSize,
    processed: rotation.selected.length,
    nextCursor: rotation.nextCursor,
    processedProtocols: rotation.selected.map((row) => row.protocol),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
