#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);
const DATA_DIR = path.join(ROOT, "data");
const REPORTS_DIR = path.join(ROOT, "reports");
const REPOS_DIR = path.join(DATA_DIR, "repos");
const DB_PATH = path.join(DATA_DIR, "review-db.json");
const LIST_PATH = path.join(ROOT, "list.md");
const SNAPSHOT_PATH = path.join(DATA_DIR, "snapshot.json");

await loadEnv(path.join(ROOT, ".env"));
const PORT = Number(process.env.PORT || 8080);
const LLM_BASE_URL = process.env.LLM_BASE_URL || "";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "";
const LLM_ENDPOINT_PATH = process.env.LLM_ENDPOINT_PATH || "";
const PGHOST = process.env.PGHOST || "hyperpulse-db";
const PGPORT = Number(process.env.PGPORT || 5432);
const PGDATABASE = process.env.PGDATABASE || process.env.POSTGRES_DB || "hyperpulse_ops";
const PGUSER = process.env.PGUSER || process.env.POSTGRES_USER || "hyperpulse";
const PGPASSWORD = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || "hyperpulse_local_dev";
let llmRunChain = Promise.resolve();
let pgPool;

function runLlmSerial(task) {
  const run = llmRunChain.catch(() => {}).then(task);
  llmRunChain = run.catch(() => {});
  return run;
}

function loadEnv(filePath) {
  return fs.readFile(filePath, "utf8").then((text) => {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i <= 0) continue;
      const key = line.slice(0, i).trim();
      let value = line.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }).catch(() => {});
}

function getPgPool() {
  if (pgPool) return pgPool;
  pgPool = new Pool({
    host: PGHOST,
    port: PGPORT,
    database: PGDATABASE,
    user: PGUSER,
    password: PGPASSWORD,
    max: 6,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 4000,
  });
  return pgPool;
}

function deriveHealthStatus(deployedRatio) {
  if (deployedRatio >= 98) return "Healthy";
  if (deployedRatio >= 70) return "Degraded";
  return "Maintenance";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const defaultProtocolNetworkMatchers = {
  aelf: ["aelf-", "a-mainnet"],
  aptos: ["apt-"],
  arbitrum: ["arb-"],
  avalanche: ["avax-"],
  base: ["base-"],
  bitcoin: ["btc-"],
  "bitcoin cash": ["bch-"],
  "bnb chain": ["bnb-"],
  chiliz: ["chz-"],
  dogecoin: ["doge-"],
  etc: ["etc-"],
  ethereum: ["eth-"],
  filecoin: ["fil-"],
  flow: ["flow-"],
  giwa: ["giwa-"],
  kaia: ["kaia-"],
  optimism: ["op-"],
  pocket: ["pokt-"],
  polygon: ["pol-"],
  solana: ["sol-"],
  sui: ["sui-"],
  tron: ["trx-"],
  thundercore: ["tt-"],
  xrp: ["xrp-"],
  zetachain: ["zeta-"],
};

function normalizeNetworkSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function buildImageMatch(expectedTag, liveImages) {
  const tag = String(expectedTag || "").trim();
  if (!tag) return null;
  const list = Array.isArray(liveImages) ? liveImages.filter(Boolean).map((item) => String(item)) : [];
  if (list.length === 0) return null;
  return list.some((image) => image.includes(`:${tag}`) || image.endsWith(`@${tag}`) || image.endsWith(tag));
}

async function loadChainAliasRows(pool) {
  try {
    const aliasRows = await pool.query(
      `
        SELECT protocol, network_slug, environment_type, argocd_application, argocd_namespace, is_primary
        FROM chain_alias_map
        ORDER BY protocol, network_slug
      `,
    );
    return aliasRows.rows.map((row) => ({
      protocol: String(row.protocol || "").trim(),
      networkSlug: normalizeNetworkSlug(row.network_slug),
      environmentType: String(row.environment_type || "").trim() || null,
      argocdApplication: String(row.argocd_application || "").trim() || null,
      argocdNamespace: String(row.argocd_namespace || "").trim() || null,
      isPrimary: Boolean(row.is_primary),
    })).filter((row) => row.protocol && row.networkSlug);
  } catch {
    return [];
  }
}

function buildAliasByProtocol(aliasRows) {
  const out = new Map();
  for (const row of aliasRows) {
    const key = normalizeText(row.protocol);
    const list = out.get(key) || [];
    list.push(row);
    out.set(key, list);
  }
  return out;
}

function loadProtocolNetworkMatchers(aliasRows) {
  const merged = new Map();
  for (const [protocol, tokens] of Object.entries(defaultProtocolNetworkMatchers)) {
    merged.set(protocol, new Set(tokens));
  }

  for (const row of aliasRows) {
    if (!row.isPrimary) continue;
    const key = normalizeText(row.protocol);
    const token = normalizeNetworkSlug(row.networkSlug);
    if (!key || !token) continue;
    const set = merged.get(key) || new Set();
    set.add(token);
    if (!token.endsWith("-")) set.add(`${token}-`);
    merged.set(key, set);
  }

  const output = {};
  for (const [key, set] of merged.entries()) {
    output[key] = [...set];
  }
  return output;
}

async function loadArgocdStatusMap(pool) {
  try {
    const rows = await pool.query(
      `
        SELECT
          protocol,
          network_slug,
          argocd_application,
          argocd_namespace,
          sync_status,
          health_status,
          source_revision,
          expected_image,
          live_images,
          image_match,
          updated_at,
          error_message
        FROM argocd_image_status
      `,
    );
    const out = new Map();
    for (const row of rows.rows) {
      const key = `${normalizeText(row.protocol)}::${normalizeNetworkSlug(row.network_slug)}`;
      out.set(key, {
        argocdApplication: row.argocd_application || null,
        argocdNamespace: row.argocd_namespace || null,
        syncStatus: row.sync_status || null,
        healthStatus: row.health_status || null,
        sourceRevision: row.source_revision || null,
        expectedImage: row.expected_image || null,
        liveImages: Array.isArray(row.live_images) ? row.live_images : [],
        imageMatch: row.image_match == null ? null : Boolean(row.image_match),
        updatedAt: row.updated_at || null,
        errorMessage: row.error_message || null,
      });
    }
    return out;
  } catch {
    return new Map();
  }
}

async function refreshArgocdImageStatus() {
  const pool = getPgPool();
  const aliasRows = await loadChainAliasRows(pool);
  const targets = aliasRows.filter((row) => row.argocdApplication);
  const snapshot = await readSnapshotItems();
  const snapshotByProtocol = new Map(
    (snapshot.items || [])
      .filter((item) => item?.protocol)
      .map((item) => [normalizeText(item.protocol), item]),
  );

  if (targets.length === 0) {
    return {
      refreshedAt: new Date().toISOString(),
      attempted: 0,
      updated: 0,
      failed: 0,
      message: "No chain_alias_map rows with argocd_application found",
    };
  }

  try {
    await execFileAsync("argocd", ["version", "--client", "--short"]);
  } catch {
    return {
      refreshedAt: new Date().toISOString(),
      attempted: targets.length,
      updated: 0,
      failed: targets.length,
      message: "argocd CLI not available",
    };
  }

  let updated = 0;
  let failed = 0;
  for (const target of targets) {
    const expectedTag = snapshotByProtocol.get(normalizeText(target.protocol))?.dockerTag || null;
    try {
      const args = ["app", "get", target.argocdApplication, "-o", "json"];
      if (target.argocdNamespace) {
        args.push("-N", target.argocdNamespace);
      }
      const { stdout } = await execFileAsync("argocd", args);
      const app = JSON.parse(stdout || "{}");
      const liveImages = Array.isArray(app?.status?.summary?.images)
        ? app.status.summary.images.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      const imageMatch = buildImageMatch(expectedTag, liveImages);

      await pool.query(
        `
          INSERT INTO argocd_image_status(
            protocol, network_slug, argocd_application, argocd_namespace,
            sync_status, health_status, source_revision, expected_image,
            live_images, image_match, error_message, raw_app_json, updated_at
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9::jsonb, $10, $11, $12::jsonb, NOW()
          )
          ON CONFLICT (protocol, network_slug, argocd_application)
          DO UPDATE SET
            argocd_namespace = EXCLUDED.argocd_namespace,
            sync_status = EXCLUDED.sync_status,
            health_status = EXCLUDED.health_status,
            source_revision = EXCLUDED.source_revision,
            expected_image = EXCLUDED.expected_image,
            live_images = EXCLUDED.live_images,
            image_match = EXCLUDED.image_match,
            error_message = EXCLUDED.error_message,
            raw_app_json = EXCLUDED.raw_app_json,
            updated_at = NOW()
        `,
        [
          target.protocol,
          target.networkSlug,
          target.argocdApplication,
          target.argocdNamespace,
          app?.status?.sync?.status || null,
          app?.status?.health?.status || null,
          app?.status?.sync?.revision || null,
          expectedTag,
          JSON.stringify(liveImages),
          imageMatch,
          null,
          JSON.stringify(app || {}),
        ],
      );
      updated += 1;
    } catch (error) {
      failed += 1;
      await pool.query(
        `
          INSERT INTO argocd_image_status(
            protocol, network_slug, argocd_application, argocd_namespace,
            expected_image, live_images, image_match, error_message, raw_app_json, updated_at
          ) VALUES (
            $1, $2, $3, $4,
            $5, '[]'::jsonb, NULL, $6, '{}'::jsonb, NOW()
          )
          ON CONFLICT (protocol, network_slug, argocd_application)
          DO UPDATE SET
            argocd_namespace = EXCLUDED.argocd_namespace,
            expected_image = EXCLUDED.expected_image,
            live_images = EXCLUDED.live_images,
            image_match = EXCLUDED.image_match,
            error_message = EXCLUDED.error_message,
            raw_app_json = EXCLUDED.raw_app_json,
            updated_at = NOW()
        `,
        [
          target.protocol,
          target.networkSlug,
          target.argocdApplication,
          target.argocdNamespace,
          expectedTag,
          error?.message || "argocd app get failed",
        ],
      ).catch(() => {});
    }
  }

  return {
    refreshedAt: new Date().toISOString(),
    attempted: targets.length,
    updated,
    failed,
    message: failed > 0 ? "Refresh completed with partial failures" : "Refresh completed",
  };
}

function resolveNetworkMatches(protocol, networks, matchers) {
  const normalizedProtocol = normalizeText(protocol);
  const keys = Object.keys(matchers).filter((key) => normalizedProtocol.includes(key));
  const tokens = keys.length > 0
    ? keys.flatMap((key) => matchers[key])
    : (normalizedProtocol.split(" ")[0] ? [`${normalizedProtocol.split(" ")[0]}-`] : []);

  const seen = new Set();
  const matched = [];
  for (const network of networks) {
    const lower = String(network || "").toLowerCase();
    if (tokens.some((token) => token.endsWith("-") ? lower.startsWith(token) : lower === token)) {
      if (!seen.has(lower)) {
        seen.add(lower);
        matched.push(network);
      }
    }
  }
  return matched;
}

async function readSnapshotItems() {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      generatedAt: parsed.generatedAt || new Date().toISOString(),
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      items: [],
    };
  }
}

async function queryChainUpdateTargets() {
  const snapshot = await readSnapshotItems();
  const pool = getPgPool();
  const aliasRows = await loadChainAliasRows(pool);
  const aliasByProtocol = buildAliasByProtocol(aliasRows);
  const protocolNetworkMatchers = loadProtocolNetworkMatchers(aliasRows);
  const argocdStatusMap = await loadArgocdStatusMap(pool);
  const latestBatch = await pool.query("SELECT id FROM import_batches ORDER BY imported_at DESC LIMIT 1");

  if (latestBatch.rowCount === 0) {
    return {
      generatedAt: new Date().toISOString(),
      snapshotGeneratedAt: snapshot.generatedAt,
      summary: {
        protocols: snapshot.items.length,
        matchedProtocols: 0,
        totalTargets: 0,
      },
      items: [],
      unmatchedProtocols: snapshot.items.map((item) => item.protocol).filter(Boolean),
    };
  }

  const batchId = latestBatch.rows[0].id;
  const rows = await pool.query(
    `
      SELECT
        COALESCE(network, '-') AS network,
        server_id,
        COALESCE(NULLIF(TRIM(host_name), ''), 'unknown-host') AS host_name,
        COALESCE(NULLIF(TRIM(environment_type), ''), 'unknown') AS environment_type,
        COALESCE(NULLIF(TRIM(deployment_status), ''), 'unknown') AS deployment_status
      FROM server_inventory
      WHERE batch_id = $1
      ORDER BY network, host_name, server_id
    `,
    [batchId],
  );

  const byNetwork = new Map();
  for (const row of rows.rows) {
    const network = row.network || "-";
    const list = byNetwork.get(network) || [];
    list.push({
      network,
      serverId: row.server_id || "-",
      hostName: row.host_name || "unknown-host",
      environmentType: row.environment_type || "unknown",
      deploymentStatus: row.deployment_status || "unknown",
    });
    byNetwork.set(network, list);
  }

  const availableNetworks = [...byNetwork.keys()];
  const sortedSnapshot = [...snapshot.items].sort((a, b) => {
    const ta = new Date(a?.updatedAt || 0).getTime();
    const tb = new Date(b?.updatedAt || 0).getTime();
    if (tb !== ta) return tb - ta;
    return String(a?.protocol || "").localeCompare(String(b?.protocol || ""));
  });

  const items = [];
  const unmatchedProtocols = [];
  let matchedProtocols = 0;
  for (const snap of sortedSnapshot) {
    const protocol = String(snap?.protocol || "").trim();
    if (!protocol) continue;
    const protocolKey = normalizeText(protocol);
    const aliasList = aliasByProtocol.get(protocolKey) || [];
    let matchedNetworks = aliasList
      .map((row) => row.networkSlug)
      .filter((slug) => availableNetworks.includes(slug));

    if (matchedNetworks.length === 0) {
      matchedNetworks = resolveNetworkMatches(protocol, availableNetworks, protocolNetworkMatchers);
    }

    if (matchedNetworks.length === 0) {
      unmatchedProtocols.push(protocol);
      continue;
    }

    matchedProtocols += 1;
    for (const network of matchedNetworks) {
      const targets = byNetwork.get(network) || [];
      const alias = aliasList.find((row) => row.networkSlug === network) || null;
      const argocd = argocdStatusMap.get(`${protocolKey}::${normalizeNetworkSlug(network)}`) || null;
      for (const target of targets) {
        const liveImages = Array.isArray(argocd?.liveImages) ? argocd.liveImages : [];
        const firstLiveImage = liveImages[0] || null;
        const expectedImage = argocd?.expectedImage || snap.dockerTag || null;
        const imageMatch = argocd?.imageMatch == null
          ? buildImageMatch(expectedImage, liveImages)
          : argocd.imageMatch;
        items.push({
          protocol,
          targetVersion: snap.version || "n/a",
          updatedAt: snap.updatedAt || null,
          dockerTag: snap.dockerTag || null,
          dockerStatus: snap.dockerStatus || null,
          network,
          serverId: target.serverId,
          hostName: target.hostName,
          environmentType: target.environmentType,
          deploymentStatus: target.deploymentStatus,
          argocdApp: argocd?.argocdApplication || alias?.argocdApplication || null,
          argocdSyncStatus: argocd?.syncStatus || null,
          argocdHealthStatus: argocd?.healthStatus || null,
          desiredImage: expectedImage,
          liveImage: firstLiveImage,
          imageMatch,
          argocdUpdatedAt: argocd?.updatedAt || null,
          argocdError: argocd?.errorMessage || null,
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    snapshotGeneratedAt: snapshot.generatedAt,
    summary: {
      protocols: sortedSnapshot.length,
      matchedProtocols,
      totalTargets: items.length,
    },
    items,
    unmatchedProtocols,
  };
}

async function queryServerStatus() {
  const pool = getPgPool();
  const latestBatchSql = "SELECT id FROM import_batches ORDER BY imported_at DESC LIMIT 1";
  const latestBatch = await pool.query(latestBatchSql);
  if (latestBatch.rowCount === 0) {
    return {
      generatedAt: new Date().toISOString(),
      summary: { idcCount: 0, healthyCount: 0, totalServers: 0, totalChains: 0 },
      items: [],
    };
  }

  const batchId = latestBatch.rows[0].id;
  const rowsSql = `
    WITH normalized AS (
      SELECT
        COALESCE(NULLIF(TRIM(host_name), ''), 'unknown-host') AS idc,
        CASE
          WHEN LOWER(COALESCE(NULLIF(TRIM(host_name), ''), '')) LIKE 'cherryservers-%' THEN 'Cherryservers'
          WHEN LOWER(COALESCE(NULLIF(TRIM(host_name), ''), '')) LIKE 'g-idc-%' THEN 'G-IDC'
          ELSE 'IDC'
        END AS region,
        COALESCE(NULLIF(TRIM(environment_type), ''), 'unknown') AS environment_type,
        COALESCE(network, '-') AS chain,
        server_id,
        deployment_status,
        COALESCE(
          total_cpu_vcore,
          CASE
            WHEN raw_row_json->>'c07' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (raw_row_json->>'c07')::numeric
            ELSE NULL
          END,
          0
        ) AS cpu_vcore,
        COALESCE(
          total_memory_gb,
          CASE
            WHEN raw_row_json->>'c08' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (raw_row_json->>'c08')::numeric
            ELSE NULL
          END,
          0
        ) AS memory_gb,
        COALESCE(
          total_storage_tb,
          CASE
            WHEN raw_row_json->>'c09' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (raw_row_json->>'c09')::numeric
            ELSE NULL
          END,
          0
        ) AS storage_tb
      FROM server_inventory
      WHERE batch_id = $1
    )
    SELECT
      idc,
      STRING_AGG(DISTINCT region, ', ') AS region,
      COUNT(*)::int AS servers,
      COUNT(DISTINCT chain)::int AS chains,
      ROUND(COALESCE(SUM(cpu_vcore), 0)::numeric, 0) AS total_cpu_vcore,
      ROUND(COALESCE(SUM(memory_gb), 0)::numeric, 0) AS total_memory_gb,
      ROUND(COALESCE(SUM(storage_tb), 0)::numeric, 0) AS total_storage_tb,
      ROUND(100.0 * AVG(CASE WHEN deployment_status = 'Deployed' THEN 1 ELSE 0 END), 1) AS deployed_ratio,
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'chain', chain,
          'node', server_id,
          'client', environment_type,
          'resources', CONCAT(
            'cpu ', ROUND(cpu_vcore::numeric, 0)::int::text,
            ' / mem ', ROUND(memory_gb::numeric, 0)::int::text, 'Gi',
            ' / storage ', ROUND(storage_tb::numeric, 0)::int::text, 'Ti'
          )
        )
        ORDER BY chain, server_id
      ) AS nodes
    FROM normalized
    GROUP BY idc
    ORDER BY idc
  `;
  const rows = await pool.query(rowsSql, [batchId]);

  const items = rows.rows.map((row) => {
    const deployedRatio = Number(row.deployed_ratio || 0);
    return {
      idc: row.idc,
      region: row.region || "unknown",
      uptime: `${deployedRatio.toFixed(1)}%`,
      latency: "n/a",
      status: deriveHealthStatus(deployedRatio),
      servers: Number(row.servers || 0),
      chains: Number(row.chains || 0),
      totalCpuVcore: Number(row.total_cpu_vcore || 0),
      totalMemoryGb: Number(row.total_memory_gb || 0),
      totalStorageTb: Number(row.total_storage_tb || 0),
      nodes: Array.isArray(row.nodes) ? row.nodes.slice(0, 20) : [],
    };
  });

  const summary = {
    idcCount: items.length,
    healthyCount: items.filter((item) => item.status === "Healthy").length,
    totalServers: items.reduce((sum, item) => sum + item.servers, 0),
    totalChains: items.reduce((sum, item) => sum + item.chains, 0),
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    items,
  };
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

 

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

async function serveStatic(reqPath, res) {
  const clean = reqPath === "/" ? "index.html" : String(reqPath || "").replace(/^\/+/, "");
  const fullPath = path.join(ROOT, clean);
  const safePath = path.normalize(fullPath);
  if (!safePath.startsWith(ROOT)) {
    json(res, 400, { error: "Invalid path" });
    return;
  }

  try {
    const content = await fs.readFile(safePath);
    res.writeHead(200, { "content-type": contentType(safePath) });
    res.end(content);
  } catch {
    json(res, 404, { error: "Not found" });
  }
}

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

async function loadClients() {
  const markdown = await fs.readFile(LIST_PATH, "utf8");
  const match = markdown.match(/```csv([\s\S]*?)```/m);
  if (!match) return [];
  const lines = match[1].split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    return {
      protocol: row[0] || "",
      githubRepo: row[2] || "",
    };
  });
}

function parseGithubRepo(value) {
  if (!value) return null;
  const text = value.replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "").trim();
  const m = text.match(/^([^/]+)\/([^/\s?#]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

function decodeXml(text) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function parseRssEntries(xmlText) {
  const matches = [...xmlText.matchAll(/<entry[\s\S]*?<\/entry>/gi)];
  return matches.map((found) => {
    const entry = found[0];
    const id = decodeXml((entry.match(/<id>([\s\S]*?)<\/id>/i)?.[1] || "").trim());
    const title = decodeXml((entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, "").trim());
    const updatedAt = (entry.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] || "").trim() || null;
    const link = (entry.match(/<link[^>]*href="([^"]+)"/i)?.[1] || "").trim() || null;
    return { id: id || title || updatedAt || "unknown", title: title || "Untitled", updatedAt, link };
  });
}

async function fetchReleaseEntries(githubRepo, limit = 10) {
  const parsed = parseGithubRepo(githubRepo);
  if (!parsed) return [];
  const url = `https://github.com/${parsed.owner}/${parsed.repo}/releases.atom`;
  const res = await fetch(url, { headers: { "user-agent": "hyperpulse-client-review/1.0" } });
  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${res.status}`);
  }
  const xml = await res.text();
  return parseRssEntries(xml).slice(0, limit);
}

async function fetchLatestReleaseEntry(githubRepo) {
  const entries = await fetchReleaseEntries(githubRepo, 1);
  return entries[0] || null;
}

async function enrichRecentReportsWithGithubUpdatedAt(protocolName, recentReports) {
  const list = Array.isArray(recentReports) ? recentReports : [];
  if (!list.length) return list;
  try {
    const clients = await loadClients();
    const client = clients.find((item) => item.protocol === protocolName);
    if (!client?.githubRepo) return list;
    const releases = await fetchReleaseEntries(client.githubRepo, 40);
    const byId = new Map(releases.map((item) => [item.id, item.updatedAt]));
    const byTitle = new Map(releases.map((item) => [item.title, item.updatedAt]));
    return list.map((item) => ({
      ...item,
      githubUpdatedAt: item.githubUpdatedAt
        || item.rssUpdatedAt
        || byId.get(item.rssId)
        || byTitle.get(item.rssTitle)
        || null,
    }));
  } catch {
    return list;
  }
}

function parseReleaseTagFromLink(link) {
  const m = String(link || "").match(/\/releases\/tag\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

async function loadDb() {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { protocols: {} };
  }
}

async function saveDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`);
}

async function git(args, cwd) {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

function repoFolderName(owner, repo) {
  return `${owner}__${repo}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function ensureRepo(githubRepo) {
  const parsed = parseGithubRepo(githubRepo);
  if (!parsed) throw new Error("Invalid GitHub repository");

  const repoPath = path.join(REPOS_DIR, repoFolderName(parsed.owner, parsed.repo));
  const remoteUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
  const gitPath = path.join(repoPath, ".git");

  await fs.mkdir(REPOS_DIR, { recursive: true });
  let hasRepo = false;
  try {
    await fs.access(gitPath);
    hasRepo = true;
  } catch {}

  if (!hasRepo) {
    await execFileAsync("git", ["clone", "--depth=200", remoteUrl, repoPath], { cwd: ROOT });
    return { repoPath, remoteUrl };
  }

  let origin = "";
  try {
    origin = await git(["remote", "get-url", "origin"], repoPath);
  } catch {
    origin = "";
  }
  if (!origin.includes(`${parsed.owner}/${parsed.repo}`)) {
    await fs.rm(repoPath, { recursive: true, force: true });
    await execFileAsync("git", ["clone", "--depth=200", remoteUrl, repoPath], { cwd: ROOT });
    return { repoPath, remoteUrl };
  }

  await git(["fetch", "origin", "--prune", "--tags"], repoPath);
  const originHead = await git(["rev-parse", "--abbrev-ref", "origin/HEAD"], repoPath).catch(() => "origin/main");
  const branch = originHead.replace(/^origin\//, "") || "main";
  await git(["checkout", branch], repoPath).catch(async () => {
    await git(["checkout", "-b", branch, `origin/${branch}`], repoPath);
  });
  await git(["pull", "--ff-only", "origin", branch], repoPath);

  return { repoPath, remoteUrl };
}

async function cleanupRepo(repoPath) {
  if (!repoPath) return;
  await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
}

async function resolveCommitSha(repoPath, refName) {
  return git(["rev-list", "-n", "1", refName], repoPath).catch(() => null);
}

async function resolveHeadShaForRss(repoPath, rss) {
  const tag = parseReleaseTagFromLink(rss?.link);
  if (tag) {
    const byRef = await resolveCommitSha(repoPath, `refs/tags/${tag}`);
    if (byRef) return byRef;
    const byName = await resolveCommitSha(repoPath, tag);
    if (byName) return byName;
  }
  return git(["rev-parse", "HEAD"], repoPath);
}

async function resolveBaseFromPreviousRelease(repoPath, previousRss, fallbackHeadSha) {
  if (previousRss) {
    const prevSha = await resolveHeadShaForRss(repoPath, previousRss).catch(() => null);
    if (prevSha && prevSha !== fallbackHeadSha) return prevSha;
  }
  return git(["rev-parse", `${fallbackHeadSha}~1`], repoPath).catch(() => fallbackHeadSha);
}

async function buildDiffContext(repoPath, baseSha, headSha) {
  const [log, names, stats] = await Promise.all([
    git(["log", "--oneline", "--max-count=120", `${baseSha}..${headSha}`], repoPath).catch(() => ""),
    git(["diff", "--name-status", `${baseSha}..${headSha}`], repoPath).catch(() => ""),
    git(["diff", "--stat", `${baseSha}..${headSha}`], repoPath).catch(() => ""),
  ]);

  const topFiles = names.split("\n").filter(Boolean).slice(0, 8).map((line) => line.split(/\s+/).slice(1).join(" "));
  let patch = "";
  if (topFiles.length > 0) {
    patch = await git(["diff", "--unified=3", `${baseSha}..${headSha}`, "--", ...topFiles], repoPath).catch(() => "");
  }

  return {
    log: log.slice(0, 8000),
    names: names.slice(0, 5000),
    stats: stats.slice(0, 4000),
    patch: patch.slice(0, 12000),
  };
}

async function reviewWithLlm(payload) {
  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
    throw new Error("LLM_BASE_URL, LLM_API_KEY, LLM_MODEL are required in .env");
  }

  const root = LLM_BASE_URL.replace(/\/$/, "");
  const preferred = LLM_ENDPOINT_PATH
    ? `${root}${LLM_ENDPOINT_PATH.startsWith("/") ? "" : "/"}${LLM_ENDPOINT_PATH}`
    : `${root}/responses`;
  const endpoints = [...new Set([preferred, `${root}/responses`, `${root}/chat/completions`])];

  const system = [
    "당신은 블록체인 노드 운영 관점의 릴리즈 리뷰어입니다.",
    "출력은 반드시 JSON 하나만 반환하세요.",
    "키는 정확히 overview, critical_risks, notable_changes, review_notes, verdict, rpc_api_changes, archive_node_impact, operator_actions, migration_checklist, evidence 를 사용하세요.",
    "verdict 값은 반드시 안전/주의/위험/수동검토 중 하나만 사용하세요. 문장 금지.",
    "critical_risks, notable_changes, review_notes, rpc_api_changes, archive_node_impact, operator_actions, migration_checklist, evidence 는 반드시 문자열 배열로만 작성하세요.",
    "모든 문장은 한국어로 작성하세요.",
    "운영자 관점에서 세밀하게 작성하고, 단정 대신 근거 중심으로 작성하세요.",
    "특히 RPC/API/JSON-RPC 구조 변화, 아카이브 노드 운영 영향, 호환성/마이그레이션 위험을 우선 보고하세요.",
    "evidence에는 반드시 실제 커밋 근거(커밋로그/파일변경/diff 통계)를 인용하세요.",
  ].join(" ");
  const user = [
    `Protocol: ${payload.protocol}`,
    `Repository: ${payload.repoUrl}`,
    `RSS title: ${payload.rssTitle}`,
    `Base SHA: ${payload.baseSha}`,
    `Head SHA: ${payload.headSha}`,
    "Commit log:",
    payload.log || "(none)",
    "Changed files:",
    payload.names || "(none)",
    "Diff stat:",
    payload.stats || "(none)",
    "Patch excerpt:",
    payload.patch || "(none)",
    "Review rules:",
    "- 한국어로 작성",
    "- 기술적 디테일을 과도하게 풀어쓰지 말고 운영 관점 중심",
    "- RPC/API/JSON-RPC 인터페이스 변경 가능성은 반드시 별도 언급",
    "- 아카이브 노드(보관 정책/색인/스토리지/재동기화) 영향 반드시 점검",
    "- 운영자 액션 아이템(설정 변경, 롤백 포인트, 모니터링 지표) 포함",
    "- rpc_api_changes: RPC/API/JSON-RPC 변화만 배열로 작성",
    "- archive_node_impact: 아카이브 노드 영향만 배열로 작성",
    "- operator_actions: 즉시 실행 액션을 배열로 작성",
    "- migration_checklist: 배포 전 체크리스트를 배열로 작성",
    "- evidence: 커밋 로그/파일/통계 근거를 배열로 작성",
    "- 모든 배열 항목은 평문 문자열로 작성하고 번호 접두사(예: 1.)를 붙이지 말 것",
    "- evidence는 실제 커밋 로그/파일/통계에서 확인 가능한 근거만 작성(추정 금지)",
    "- 정책 문구(예: 확인 필요, 운영 체크 문장)를 그대로 반복하지 말 것",
    "- 실제 근거가 없으면 해당 항목은 비워두고 추정 문장 생성 금지",
  ].join("\n\n");

  let lastError = "Unknown LLM error";
  let fallbackText = "";

  for (const endpoint of endpoints) {
    const isResponsesApi = endpoint.endsWith("/responses");
    const requestBody = isResponsesApi
      ? {
          model: LLM_MODEL,
          temperature: 0.1,
          text: { format: { type: "json_object" } },
          input: [
            { role: "system", content: [{ type: "input_text", text: system }] },
            { role: "user", content: [{ type: "input_text", text: user }] },
          ],
        }
      : {
          model: LLM_MODEL,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      });

      const textBody = await res.text().catch(() => "");
      if (!res.ok) {
        lastError = `LLM request failed: ${res.status} ${textBody.slice(0, 300)}`;
        continue;
      }

      let output;
      try {
        output = textBody ? JSON.parse(textBody) : {};
      } catch {
        lastError = `LLM request returned non-JSON: ${textBody.slice(0, 300)}`;
        continue;
      }

      const endpointError = output?.error?.message || output?.message || "";
      if (/unexpected endpoint or method/i.test(String(endpointError))) {
        lastError = String(endpointError);
        continue;
      }

      const directParsed = parseReviewJson(output);
      if (directParsed) return directParsed;

      const content = extractLlmContent(output, isResponsesApi);
      if (!content.trim()) {
        lastError = "LLM response content is empty";
        continue;
      }

      const parsed = parseReviewJson(content);
      if (parsed) return parsed;

      const repaired = await repairJsonWithSecondPass(content, endpoints);
      if (repaired) return repaired;

      if (!fallbackText) fallbackText = content;
    } catch (error) {
      lastError = error?.message || String(error);
      continue;
    }
  }

  if (fallbackText) return buildFallbackReviewFromText(fallbackText);

  throw new Error(lastError);
}

function extractLlmContent(output, isResponsesApi) {
  if (!isResponsesApi) {
    const content = output?.choices?.[0]?.message?.content || output?.choices?.[0]?.text || "";
    if (Array.isArray(content)) {
      return content.map((item) => item?.text || item?.content || "").filter(Boolean).join("\n");
    }
    return String(content || "");
  }

  const chunks = [];
  if (typeof output?.output_text === "string" && output.output_text.trim()) {
    chunks.push(output.output_text);
  }

  const blocks = Array.isArray(output?.output) ? output.output : [];
  for (const block of blocks) {
    const contents = Array.isArray(block?.content) ? block.content : [];
    if (block?.type === "message") {
      for (const piece of contents) {
        if (typeof piece?.text === "string" && piece.text.trim()) chunks.push(piece.text);
      }
    }
  }

  if (chunks.length === 0) {
    for (const block of blocks) {
      const contents = Array.isArray(block?.content) ? block.content : [];
      for (const piece of contents) {
        if (typeof piece?.text === "string" && piece.text.trim()) chunks.push(piece.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

async function repairJsonWithSecondPass(rawText, endpoints) {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) return null;

  const system = "아래 텍스트를 엄격한 JSON 객체로만 변환하세요. 키: overview, critical_risks, notable_changes, review_notes, verdict, rpc_api_changes, archive_node_impact, operator_actions, migration_checklist, evidence";
  const user = `텍스트:\n${trimmed.slice(0, 16000)}`;

  for (const endpoint of endpoints) {
    const isResponsesApi = endpoint.endsWith("/responses");
    const body = isResponsesApi
      ? {
          model: LLM_MODEL,
          temperature: 0,
          text: { format: { type: "json_object" } },
          input: [
            { role: "system", content: [{ type: "input_text", text: system }] },
            { role: "user", content: [{ type: "input_text", text: user }] },
          ],
        }
      : {
          model: LLM_MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) continue;
      const textBody = await res.text();
      const output = JSON.parse(textBody || "{}");
      const content = extractLlmContent(output, isResponsesApi);
      const parsed = parseReviewJson(content);
      if (parsed) return parsed;
    } catch {}
  }

  return null;
}

function buildFallbackReviewFromText(rawText) {
  const text = String(rawText || "").trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bullets = lines
    .filter((line) => /^[-*\d.)]/.test(line))
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);

  const risks = bullets.filter((line) => /위험|리스크|risk|critical|failure|error/i.test(line)).slice(0, 5);
  const changes = bullets.slice(0, 8);
  const overview = lines.find((line) => line.length > 20) || lines[0] || "모델 원문을 기반으로 요약했습니다.";

  return {
    overview,
    critical_risks: risks.length ? risks : ["LLM 원문 기준 수동 검토가 필요합니다."],
    notable_changes: changes.length ? changes : ["모델 원문에서 구조화 가능한 변경점을 찾지 못했습니다."],
    review_notes: [text.slice(0, 1500) || "원문 없음"],
    verdict: "manual_review_required",
    rpc_api_changes: ["원문에서 RPC/API 항목을 수동 확인하세요."],
    archive_node_impact: ["원문에서 아카이브 노드 영향 항목을 수동 확인하세요."],
    operator_actions: ["해당 릴리즈를 대상으로 수동 검토 후 재실행하세요."],
    migration_checklist: ["staging 환경 검증 후 운영 반영"],
    evidence: ["원문 커밋 섹션(Commit Log)을 근거로 확인"],
  };
}

function pickReviewObjectCandidate(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickReviewObjectCandidate(item);
      if (picked) return picked;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const hasReviewKeys = (
    Object.hasOwn(value, "overview") ||
    Object.hasOwn(value, "notable_changes") ||
    Object.hasOwn(value, "critical_risks") ||
    Object.hasOwn(value, "review_notes") ||
    Object.hasOwn(value, "rpc_api_changes")
  );
  if (hasReviewKeys) return value;

  for (const key of ["result", "data", "output", "response", "content", "json", "answer"]) {
    if (!Object.hasOwn(value, key)) continue;
    const picked = pickReviewObjectCandidate(value[key]);
    if (picked) return picked;
  }

  for (const nested of Object.values(value)) {
    const picked = pickReviewObjectCandidate(nested);
    if (picked) return picked;
  }

  return null;
}

function parseReviewJson(text) {
  if (text && typeof text === "object") {
    return pickReviewObjectCandidate(text);
  }
  if (typeof text !== "string") return null;
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return pickReviewObjectCandidate(JSON.parse(cleaned));
  } catch {}

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  for (let i = end; i > start; i -= 1) {
    try {
      return pickReviewObjectCandidate(JSON.parse(cleaned.slice(start, i + 1)));
    } catch {}
  }

  return null;
}

function detectOperatorChecks(diff) {
  const source = `${diff.log || ""}\n${diff.names || ""}\n${diff.stats || ""}\n${diff.patch || ""}`.toLowerCase();
  const checks = [];
  const rules = [
    { re: /json-rpc|jsonrpc|rpc method|rpc server|rpc endpoint|eth_|debug_|trace_/, msg: "RPC/JSON-RPC 관련 변경 단서가 감지되었습니다." },
    { re: /openapi|swagger|\/api\/|router|endpoint|rest api|api version|v1\/|v2\//, msg: "외부 API 엔드포인트/버전 관련 변경 단서가 감지되었습니다." },
    { re: /archive|prun|indexer|index|state sync|snapshot|history|retention/, msg: "아카이브 노드 운영(보관/색인/동기화) 관련 변경 단서가 감지되었습니다." },
    { re: /config|toml|yaml|yml|genesis|hardfork|fork|protocol config|feature flag/, msg: "노드 설정값/프로토콜 플래그 관련 변경 단서가 감지되었습니다." },
  ];

  for (const rule of rules) {
    if (rule.re.test(source)) checks.push(rule.msg);
  }
  return [...new Set(checks)];
}

function normalizeVerdictLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "manual_review_required";
  const text = raw.toLowerCase();

  if (/위험 요소 없음|no risk|low risk|risk-free|문제 없음|안전/.test(text)) {
    return "안전";
  }

  const map = [
    { re: /safe|approve|pass|ok|merge|승인|통과/, label: "안전" },
    { re: /warn|caution|medium|주의|권장|검토 필요|주의 필요/, label: "주의" },
    { re: /risk|critical|block|reject|high|위험|치명|거부|중단/, label: "위험" },
    { re: /manual_review_required|json|format|schema|포맷|형식|정형화|llm_call_failed|model unloaded/, label: "수동검토" },
  ];

  for (const item of map) {
    if (item.re.test(text)) return item.label;
  }
  return "수동검토";
}

function normalizeReview(review, operatorChecks, context = {}) {
  const listFromText = (value) => {
    const text = String(value || "").trim();
    if (!text) return [];
    const normalized = text.replace(/\r/g, "\n");
    const byLine = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const source = byLine.length === 1 ? [normalized] : byLine;
    const out = [];
    for (const chunk of source) {
      const parts = chunk
        .split(/\s*(?=\d+\.\s+)/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length <= 1) {
        out.push(chunk);
      } else {
        out.push(...parts);
      }
    }
    return out;
  };
  const toList = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return listFromText(value);
    }
    if (value && typeof value === "object") return [value];
    return [];
  };
  const pickObjectText = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    const keys = ["text", "summary", "title", "item", "message", "detail", "reason", "action", "note", "evidence", "impact", "value"];
    for (const key of keys) {
      const raw = value[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
    return "";
  };
  const normalizeKey = (value) =>
    String(value || "")
      .replace(/^\[\s*운영\s*체크\s*\]\s*/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const isBoilerplate = (value) => {
    const text = String(value || "").trim();
    return (
      /^확인 필요[.!]?$/i.test(text) ||
      /^커밋 근거 확인 필요[.!]?$/i.test(text) ||
      /^원문에서 .*수동 확인하세요[.!]?$/i.test(text) ||
      /^정책 문구.*반복하지 말 것$/i.test(text)
    );
  };
  const sanitizeItem = (value) => {
    let text = "";
    if (typeof value === "string") {
      text = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      text = String(value);
    } else {
      text = pickObjectText(value);
    }
    return String(text || "")
      .replace(/^\d+[.)]\s+/g, "")
      .replace(/^\[\s*운영\s*체크\s*\]\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  };
  const unique = (items) => {
    const out = [];
    const seen = new Set();
    for (const raw of items || []) {
      const item = sanitizeItem(raw);
      if (!item || isBoilerplate(item)) continue;
      const key = normalizeKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };
  const normalizedVerdict = normalizeVerdictLabel(review?.verdict);
  const evidenceSource = `${context?.commitLog || ""}\n${context?.commitNames || ""}\n${context?.commitStats || ""}`.toLowerCase();
  const filterEvidence = (items) => {
    if (!evidenceSource.trim()) return items;
    return (items || []).filter((item) => {
      const line = String(item || "").trim();
      if (!line) return false;
      const commitMatch = line.match(/\b[0-9a-f]{7,40}\b/i);
      if (commitMatch) return evidenceSource.includes(commitMatch[0].toLowerCase());
      const pathMatch = line.match(/`([^`]+\/[^`]+)`/);
      if (pathMatch) return evidenceSource.includes(pathMatch[1].toLowerCase());
      return line.length >= 10;
    });
  };
  const normalizedOperatorChecks = unique(operatorChecks);
  const operatorCheckKeys = new Set(normalizedOperatorChecks.map((item) => normalizeKey(item)));
  const normalizedNotableChanges = unique(toList(review?.notable_changes)).filter(
    (item) => !operatorCheckKeys.has(normalizeKey(item)),
  );
  const normalized = {
    overview: typeof review?.overview === "string" ? review.overview : "요약 정보가 없습니다.",
    critical_risks: unique(toList(review?.critical_risks)),
    notable_changes: normalizedNotableChanges,
    review_notes: unique(toList(review?.review_notes)),
    rpc_api_changes: unique(toList(review?.rpc_api_changes)),
    archive_node_impact: unique(toList(review?.archive_node_impact)),
    operator_actions: unique(toList(review?.operator_actions)),
    migration_checklist: unique(toList(review?.migration_checklist)),
    evidence: filterEvidence(unique(toList(review?.evidence))),
    verdict: normalizedVerdict,
    operator_checks: normalizedOperatorChecks,
  };

  return normalized;
}

function buildRecentReports(reports) {
  const list = reports || [];
  const out = [];
  const seen = new Set();
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    const key = item.rssId || item.rssTitle || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: item.id,
      rssId: item.rssId || null,
      generatedAt: item.generatedAt,
      githubUpdatedAt: item.githubUpdatedAt || item.rssUpdatedAt || null,
      verdict: item.verdict,
      headSha: item.headSha,
      rssTitle: item.rssTitle || "(unknown)",
      markdown: item.markdown || "생성된 리포트가 없습니다.",
    });
    if (out.length >= 5) break;
  }
  return out;
}

function buildMarkdown(review, ctx) {
  const risks = Array.isArray(review.critical_risks) ? review.critical_risks : [];
  const changes = Array.isArray(review.notable_changes) ? review.notable_changes : [];
  const notes = Array.isArray(review.review_notes) ? review.review_notes : [];
  const checks = Array.isArray(review.operator_checks) ? review.operator_checks : [];
  const rpc = Array.isArray(review.rpc_api_changes) ? review.rpc_api_changes : [];
  const archive = Array.isArray(review.archive_node_impact) ? review.archive_node_impact : [];
  const actions = Array.isArray(review.operator_actions) ? review.operator_actions : [];
  const checklist = Array.isArray(review.migration_checklist) ? review.migration_checklist : [];
  const evidence = Array.isArray(review.evidence) ? review.evidence : [];
  const commit = ctx.commitContext || {};
  const safe = (v) => String(v || "(none)").slice(0, 16000);

  const lines = [
    `# ${ctx.protocol} 운영 리포트`,
    "",
    `- 생성 시각: ${ctx.generatedAt}`,
    `- RSS: ${ctx.rssTitle}`,
    `- 비교 기준(Base): ${ctx.baseSha}`,
    `- 최신 커밋(Head): ${ctx.headSha}`,
    "",
    "## 한줄 요약",
    review.overview || "요약 정보가 없습니다.",
    "",
    "## 운영자 중요 체크",
    checks.length ? checks.map((v) => `- ${v}`).join("\n") : "- 특이사항 없음",
    "",
    "## 주요 변경점",
    changes.length ? changes.map((v) => `- ${v}`).join("\n") : "- 주요 변경점 없음",
    "",
    "## RPC/API 영향",
    rpc.length ? rpc.map((v) => `- ${v}`).join("\n") : "- 해당 사항 없음",
    "",
    "## 아카이브 노드 영향",
    archive.length ? archive.map((v) => `- ${v}`).join("\n") : "- 해당 사항 없음",
    "",
    "## 운영 액션 아이템",
    actions.length ? actions.map((v) => `- ${v}`).join("\n") : "- 해당 사항 없음",
    "",
    "## 마이그레이션 체크리스트",
    checklist.length ? checklist.map((v) => `- ${v}`).join("\n") : "- 해당 사항 없음",
    "",
    "## 위험/주의 사항",
    risks.length ? risks.map((v) => `- ${v}`).join("\n") : "- 위험 요소 없음",
    "",
    "## 근거(Evidence)",
    evidence.length ? evidence.map((v) => `- ${v}`).join("\n") : "- 근거 데이터 없음",
    "",
    "## 운영 메모",
    notes.length ? notes.map((v) => `- ${v}`).join("\n") : "- 추가 메모 없음",
    "",
    "## 원문 커밋 내용",
    "### Commit Log",
    "```text",
    safe(commit.log),
    "```",
    "",
  ];

  return lines.join("\n");
}

async function createReportForRelease({ protocolName, repo, rss, baseSha, headSha }) {
  const diff = await buildDiffContext(repo.repoPath, baseSha, headSha);
  const commitContext = {
    log: diff.log || "",
    stats: diff.stats || "",
  };
  const operatorChecks = detectOperatorChecks(diff);
  const llmInput = {
    protocol: protocolName,
    repoUrl: repo.remoteUrl,
    rssTitle: rss.title,
    baseSha,
    headSha,
    ...diff,
  };

  let reviewJson;
  try {
    reviewJson = await runLlmSerial(() => reviewWithLlm(llmInput));
  } catch (error) {
    reviewJson = {
      overview: "로컬 LLM 호출 실패로 자동 분석이 완료되지 않았습니다.",
      critical_risks: ["모델 응답 부재로 운영 리스크 검토가 부분 완료 상태입니다."],
      notable_changes: ["레포지토리 동기화와 diff 수집은 완료되었으나 모델 결과가 없습니다."],
      review_notes: [error.message || "알 수 없는 LLM 오류"],
      rpc_api_changes: ["확인 필요"],
      archive_node_impact: ["확인 필요"],
      operator_actions: ["LLM 상태 복구 후 재실행"],
      migration_checklist: ["테스트넷 검증 후 운영 반영"],
      evidence: ["커밋 원문 섹션을 참고해 수동 검토 필요"],
      verdict: "llm_call_failed",
    };
  }
  reviewJson = normalizeReview(reviewJson, operatorChecks, {
    commitLog: commitContext.log,
    commitNames: diff.names,
    commitStats: commitContext.stats,
  });

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const reportId = `${protocolName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
  const markdown = buildMarkdown(reviewJson, {
    protocol: protocolName,
    generatedAt,
    rssTitle: rss.title,
    baseSha,
    headSha,
    commitContext,
  });
  const reportPath = path.join(REPORTS_DIR, `${reportId}.md`);
  await fs.writeFile(reportPath, `${markdown}\n`);

  return {
    id: reportId,
    generatedAt,
    githubUpdatedAt: rss.updatedAt || null,
    rssUpdatedAt: rss.updatedAt || null,
    rssId: rss.id,
    rssTitle: rss.title,
    baseSha,
    headSha,
    verdict: reviewJson.verdict || "unknown",
    commitContext,
    markdown,
    reportPath,
  };
}

async function backfillHistoricalReports(protocolName, client, db, limit, options = {}) {
  const count = Math.max(1, Math.min(10, Number(limit) || 5));
  const maxCreate = Math.max(1, Number(options.maxCreate) || Number.POSITIVE_INFINITY);
  const releases = await fetchReleaseEntries(client.githubRepo, count + 1);
  if (releases.length === 0) return { created: 0, skipped: 0, requested: count };

  const repo = await ensureRepo(client.githubRepo);
  const current = db.protocols[protocolName] || { reports: [] };
  const reports = [...(current.reports || [])];
  const seen = new Set(reports.map((item) => item.rssId || item.rssTitle));

  let created = 0;
  let skipped = 0;
  try {
    const target = releases.slice(0, count);
    for (let i = target.length - 1; i >= 0; i -= 1) {
      if (created >= maxCreate) break;
      const rss = target[i];
      const rssKey = rss.id || rss.title;
      if (seen.has(rssKey)) {
        skipped += 1;
        continue;
      }

      const headSha = await resolveHeadShaForRss(repo.repoPath, rss);
      const previousRss = releases[i + 1] || null;
      const baseSha = await resolveBaseFromPreviousRelease(repo.repoPath, previousRss, headSha);
      const report = await createReportForRelease({ protocolName, repo, rss, baseSha, headSha });
      reports.push(report);
      seen.add(rssKey);
      created += 1;
    }

    db.protocols[protocolName] = {
      ...current,
      lastRssEntryId: releases[0].id,
      lastHeadSha: await resolveHeadShaForRss(repo.repoPath, releases[0]),
      reports: reports.slice(-30),
    };
    await saveDb(db);
  } finally {
    await cleanupRepo(repo.repoPath);
  }

  return { created, skipped, requested: count };
}

async function runReview(protocolName) {
  const clients = await loadClients();
  const client = clients.find((item) => item.protocol === protocolName);
  if (!client) {
    throw new Error("Protocol not found in list.md");
  }

  const rss = await fetchLatestReleaseEntry(client.githubRepo);
  if (!rss) {
    throw new Error("No RSS entry found");
  }

  const db = await loadDb();
  db.protocols ||= {};
  const current = db.protocols[protocolName] || { reports: [] };

  if (current.lastRssEntryId && current.lastRssEntryId === rss.id && current.reports.length > 0) {
    const latest = current.reports[current.reports.length - 1];
    return {
      status: "no_new_rss",
      message: "",
      protocol: protocolName,
      rss,
      report: latest,
      recentReports: buildRecentReports(current.reports),
    };
  }

  const repo = await ensureRepo(client.githubRepo);
  let report;
  let headSha;
  try {
    headSha = await resolveHeadShaForRss(repo.repoPath, rss);
    let baseSha;
    if (current.lastHeadSha) {
      const exists = await git(["cat-file", "-e", `${current.lastHeadSha}^{commit}`], repo.repoPath).then(() => true).catch(() => false);
      baseSha = exists && current.lastHeadSha !== headSha
        ? current.lastHeadSha
        : await resolveBaseFromPreviousRelease(repo.repoPath, null, headSha);
    } else {
      const latestTwo = await fetchReleaseEntries(client.githubRepo, 2);
      baseSha = await resolveBaseFromPreviousRelease(repo.repoPath, latestTwo[1] || null, headSha);
    }
    report = await createReportForRelease({ protocolName, repo, rss, baseSha, headSha });

    db.protocols[protocolName] = {
      lastRssEntryId: rss.id,
      lastHeadSha: headSha,
      reports: [...(current.reports || []), report].slice(-30),
    };
    await saveDb(db);
  } finally {
    await cleanupRepo(repo.repoPath);
  }

  return {
    status: "new_rss_processed",
    message: "새 RSS를 감지해 리포트를 생성했습니다.",
    protocol: protocolName,
    rss,
    report,
    recentReports: buildRecentReports(db.protocols[protocolName].reports),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);

  if (req.method === "GET" && url.pathname === "/api/server-status") {
    try {
      const payload = await queryServerStatus();
      json(res, 200, { status: "ok", ...payload });
    } catch (error) {
      json(res, 503, { error: error.message || "Failed to load server status" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/chain-update-targets") {
    try {
      const payload = await queryChainUpdateTargets();
      json(res, 200, { status: "ok", ...payload });
    } catch (error) {
      json(res, 503, { error: error.message || "Failed to load chain update targets" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chain-update-targets/refresh-argocd") {
    try {
      const payload = await refreshArgocdImageStatus();
      json(res, 200, { status: "ok", ...payload });
    } catch (error) {
      json(res, 503, { error: error.message || "Failed to refresh ArgoCD status" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/client-review") {
    const protocolName = (url.searchParams.get("protocol") || "").trim();
    const backfillCount = Number(url.searchParams.get("backfill") || 0);
    const backfillMode = String(url.searchParams.get("mode") || "").trim().toLowerCase();

    if (!protocolName) {
      json(res, 400, { error: "Missing protocol query parameter" });
      return;
    }

    try {
      if (backfillCount > 0) {
        const clients = await loadClients();
        const client = clients.find((item) => item.protocol === protocolName);
        if (!client) {
          json(res, 404, { error: "Protocol not found in list.md" });
          return;
        }
        const db = await loadDb();
        const summary = await backfillHistoricalReports(
          protocolName,
          client,
          db,
          backfillCount,
          backfillMode === "step" ? { maxCreate: 1 } : undefined,
        );
        if (backfillMode === "step") {
          const current = db.protocols?.[protocolName] || { reports: [] };
          const latest = current.reports[current.reports.length - 1] || null;
          json(res, 200, {
            status: summary.created > 0 ? "backfill_step_created" : "backfill_step_idle",
            message: summary.created > 0 ? "리포트 1건 생성 완료" : "추가 생성 항목 없음",
            protocol: protocolName,
            report: latest,
            backfill: summary,
            recentReports: buildRecentReports(current.reports),
          });
          return;
        }
        const payload = await runReview(protocolName);
        payload.backfill = summary;
        json(res, 200, payload);
        return;
      }

      const payload = await runReview(protocolName);
      json(res, 200, payload);
    } catch (error) {
      json(res, 500, { error: error.message || "Unexpected error" });
    }
    return;
  }

  await serveStatic(url.pathname, res);
});

server.listen(PORT, () => {
  console.log(`hyperpulse server running at http://localhost:${PORT}`);
});
