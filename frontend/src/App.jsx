import { useEffect, useMemo, useState } from "react";

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

function extractCsvFromMarkdown(markdown) {
  const match = markdown.match(/```csv([\s\S]*?)```/m);
  if (!match) {
    throw new Error("CSV block not found in list.md");
  }
  const lines = match[1].split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.slice(1).map((line, idx) => {
    const row = parseCsvLine(line);
    return {
      id: `p-${idx + 1}`,
      protocol: row[0] || "",
      officialSite: row[1] || "",
      githubRepo: row[2] || "",
      dockerImage: row[3] || "",
      note: row[4] || "",
    };
  });
}

function toSiteUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function siteDomain(value) {
  try {
    return new URL(toSiteUrl(value)).hostname;
  } catch {
    return "";
  }
}

function githubUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  return `https://github.com/${value.replace(/^\/+/, "")}`;
}

function fmtDate(iso) {
  if (!iso) return "n/a";
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return "n/a";
  return time.toLocaleString();
}

function normalizeSortValue(value) {
  if (value == null) return "";
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  const text = String(value).trim();
  const asNumber = Number(text.replace(/,/g, ""));
  if (!Number.isNaN(asNumber) && text !== "") return asNumber;
  const asDate = Date.parse(text);
  if (!Number.isNaN(asDate) && /\d/.test(text)) return asDate;
  return text.toLowerCase();
}

function sortRowsByConfig(rows, sortConfig, getValue) {
  if (!sortConfig?.key || !Array.isArray(rows)) return rows;
  const dir = sortConfig.direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = normalizeSortValue(getValue(a, sortConfig.key));
    const bv = normalizeSortValue(getValue(b, sortConfig.key));
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function nextSortConfig(current, key, defaultDirection = "asc") {
  if (!current || current.key !== key) {
    return { key, direction: defaultDirection };
  }
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

function SortHeaderButton({ label, columnKey, sortConfig, onToggle }) {
  const isActive = sortConfig?.key === columnKey;
  const indicator = isActive ? (sortConfig.direction === "asc" ? "▲" : "▼") : "↕";
  return (
    <button
      type="button"
      className={`tableSortButton ${isActive ? "active" : ""}`}
      onClick={() => onToggle(columnKey)}
      aria-label={`Sort by ${label} ${isActive && sortConfig.direction === "asc" ? "descending" : "ascending"}`}
    >
      <span>{label}</span>
      <span aria-hidden="true">{indicator}</span>
    </button>
  );
}

function argocdSyncTone(value) {
  const status = String(value || "pending").toLowerCase();
  if (status === "synced") return "synced";
  if (status === "outofsync" || status === "out-of-sync") return "outofsync";
  if (status === "progressing") return "progressing";
  return "pending";
}

function ArgocdSyncStatus({ value }) {
  const tone = argocdSyncTone(value);
  const label = value || "pending";
  const icon = tone === "synced" ? "✓" : tone === "outofsync" ? "×" : tone === "progressing" ? "◷" : "•";
  return (
    <span className={`syncStatus syncStatus-${tone}`}>
      <span className="syncStatusIcon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

const HOME_PAGES = [
  { id: "home", plane: "Overview", title: "Main Dashboard", desc: "Live billboard for priority operations" },
  { id: "server-status", plane: "Observability", title: "Server Status", desc: "Node, workload, and storage health overview" },
  { id: "alerts-log", plane: "Observability", title: "Alerts Log", desc: "Alert stream and AI triage context" },
  { id: "alerts-reports", plane: "Observability", title: "Alerts Reports", desc: "Daily, weekly, and monthly reliability reports" },
  { id: "chain-update", plane: "Change", title: "Chain Update", desc: "ArgoCD phased rollout workflow preview" },
  { id: "chain-migration", plane: "Change", title: "Chain Migration", desc: "DB and chain-data relocation workflow preview" },
  { id: "chain-snapshot", plane: "Change", title: "Chain Snapshot", desc: "Backup and restore-drill policy workflow preview" },
  { id: "chain-update-info", plane: "Intelligence", title: "Chain Update Info", desc: "Client catalog and release freshness" },
];

const HOME_PAGE_SET = new Set(HOME_PAGES.map((item) => item.id));

const DEFAULT_SCOPE = {
  environment: "prod",
  cluster: "global-core",
  region: "all-regions",
  chain: "all-chains",
  namespace: "all-namespaces",
  timeRange: "last-30m",
  refresh: "30s",
  paused: false,
};

const THEME_STORAGE_KEY = "hyperpulse.theme";

function detectSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveInitialThemeState() {
  if (typeof window === "undefined") {
    return { theme: "dark", followSystem: true };
  }
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") {
      return { theme: saved, followSystem: false };
    }
  } catch {}
  return { theme: detectSystemTheme(), followSystem: true };
}

function parseScopeParams(search) {
  const params = new URLSearchParams(search || "");
  const pausedRaw = (params.get("paused") || "").toLowerCase();
  return {
    environment: params.get("env") || DEFAULT_SCOPE.environment,
    cluster: params.get("cluster") || DEFAULT_SCOPE.cluster,
    region: params.get("region") || DEFAULT_SCOPE.region,
    chain: params.get("chain") || DEFAULT_SCOPE.chain,
    namespace: params.get("ns") || DEFAULT_SCOPE.namespace,
    timeRange: params.get("time") || DEFAULT_SCOPE.timeRange,
    refresh: params.get("refresh") || DEFAULT_SCOPE.refresh,
    paused: pausedRaw === "1" || pausedRaw === "true",
  };
}

function buildScopeQuery(scope) {
  const safe = { ...DEFAULT_SCOPE, ...(scope || {}) };
  const params = new URLSearchParams();
  params.set("env", safe.environment);
  params.set("cluster", safe.cluster);
  params.set("region", safe.region);
  params.set("chain", safe.chain);
  params.set("ns", safe.namespace);
  params.set("time", safe.timeRange);
  params.set("refresh", safe.refresh);
  params.set("paused", safe.paused ? "1" : "0");
  return params.toString();
}

function parseHashParts() {
  const hash = window.location.hash || "";
  const route = hash.startsWith("#") ? hash.slice(1) : hash;
  const [pathPart, queryPart] = route.split("?");
  return {
    path: pathPart || "",
    scope: parseScopeParams(queryPart || ""),
  };
}

const PAGE_SUBPAGES = {
  home: [
    { id: "priority-wall", label: "Priority wall", desc: "Live priorities and active risks" },
    { id: "update-board", label: "Update board", desc: "Latest chain and release updates" },
  ],
  "server-status": [
    { id: "health-overview", label: "Health overview", desc: "Service uptime and latency" },
  ],
  "alerts-log": [
    { id: "incident-stream", label: "Incident stream", desc: "Live incidents and AI context" },
  ],
  "alerts-reports": [
    { id: "cycle-metrics", label: "Cycle metrics", desc: "Daily to monthly quality" },
  ],
  "chain-update": [
    { id: "rollout-flow", label: "Rollout flow", desc: "Phased upgrade progression" },
    { id: "gate-controls", label: "Gate controls", desc: "Safety checks and guardrails" },
  ],
  "chain-migration": [
    { id: "migration-flow", label: "Migration flow", desc: "Lock, copy, and cutover stages" },
    { id: "cutover-readiness", label: "Cutover readiness", desc: "Readiness checklist and risks" },
  ],
  "chain-snapshot": [
    { id: "base-pvc-runbook", label: "BASE PVC Runbook", desc: "Chain-by-chain execution guide" },
  ],
  "chain-update-info": [
    { id: "catalog-view", label: "Catalog view", desc: "Client freshness and links" },
  ],
};

function parseHashRoute() {
  const { path, scope } = parseHashParts();
  const protocolMatch = path.match(/^\/protocol\/(.+)$/);
  if (protocolMatch) {
    return { type: "protocol-detail", protocol: decodeURIComponent(protocolMatch[1]), scope };
  }

  const chainTargetMatch = path.match(/^\/chain-update-target\/(.+)$/);
  if (chainTargetMatch) {
    return {
      type: "chain-update-target-detail",
      targetKey: decodeURIComponent(chainTargetMatch[1]),
      scope,
    };
  }

  const opsDetailMatch = path.match(/^\/ops\/([^/]+)\/(.+)$/);
  if (opsDetailMatch) {
    return {
      type: "ops-detail",
      entity: decodeURIComponent(opsDetailMatch[1]),
      entityId: decodeURIComponent(opsDetailMatch[2]),
      scope,
    };
  }

  const page = path.replace(/^\//, "").trim() || "home";
  if (HOME_PAGE_SET.has(page)) {
    return { type: "page", page, scope };
  }
  return { type: "page", page: "home", scope };
}

function setProtocolRoute(protocol, scope = DEFAULT_SCOPE) {
  window.location.hash = `#/protocol/${encodeURIComponent(protocol)}?${buildScopeQuery(scope)}`;
}

function setOpsDetailRoute(entity, entityId, scope = DEFAULT_SCOPE) {
  window.location.hash = `#/ops/${encodeURIComponent(entity)}/${encodeURIComponent(entityId)}?${buildScopeQuery(scope)}`;
}

function setPageRoute(pageId, scope = DEFAULT_SCOPE) {
  const safe = HOME_PAGE_SET.has(pageId) ? pageId : "home";
  window.location.hash = `#/${safe}?${buildScopeQuery(scope)}`;
}

function buildUpdateTargetKey(row) {
  return [row?.protocol || "", row?.network || "", row?.serverId || ""].join("::");
}

function setChainUpdateTargetRoute(targetKey, scope = DEFAULT_SCOPE) {
  window.location.hash = `#/chain-update-target/${encodeURIComponent(targetKey)}?${buildScopeQuery(scope)}`;
}

function parseReport(markdown) {
  const text = String(markdown || "");
  if (!text.trim()) return [];
  const isObjectLeak = (line) => /^(\-\s*)?\[object Object\]$/i.test(String(line || "").trim());

  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = { title: "Summary", items: [] };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isObjectLeak(line)) continue;
    if (line.startsWith("## ")) {
      if (current.items.length > 0) sections.push(current);
      current = { title: line.replace(/^##\s+/, "").trim(), items: [] };
      continue;
    }
    if (line.startsWith("### ")) {
      current.items.push(line.replace(/^###\s+/, "").trim());
      continue;
    }
    if (line.startsWith("- ")) {
      current.items.push(line.slice(2).trim());
      continue;
    }
    if (line.startsWith("```")) continue;
    if (line.startsWith("# ")) continue;
    current.items.push(line);
  }

  if (current.items.length > 0) sections.push(current);

  const deduped = sections
    .map((section) => ({
      ...section,
      items: [...new Set(section.items.map((item) => item.trim()).filter(Boolean))],
    }))
    .filter((section) => section.items.length > 0);

  return deduped;
}

const snapshotServerOptions = [
  "idc-chain-cluster-master-01",
  "idc-chain-cluster-master-02",
  "idc-chain-cluster-master-03",
  "idc-chain-cluster-master-04",
];

const intelligenceIncidentItems = [
  {
    title: "Execution lag recurrence risk",
    confidence: "High",
    summary: "Recurring lag pattern linked to uneven peer routing and burst traffic.",
    action: "Rebalance peers and tighten gateway burst limits for 24h.",
  },
  {
    title: "Indexer backlog regression",
    confidence: "Medium",
    summary: "Queue growth correlates with release windows and heavy reindex tasks.",
    action: "Shift reindex schedule outside deployment windows.",
  },
  {
    title: "Snapshot restore readiness gap",
    confidence: "Medium",
    summary: "Two chains have stale restore drill metadata beyond policy target.",
    action: "Trigger restore drills and attach evidence artifacts.",
  },
];

const intelligenceReportCards = [
  {
    period: "Daily",
    headline: "Alert volume dropped 8% with stable P1 count.",
    detail: "Top unstable chain: Polygon execution cluster (latency + error bursts).",
  },
  {
    period: "Weekly",
    headline: "Most repeated fingerprint tied to RPC throttling under load.",
    detail: "Recommended prevention: canary load checks before rollout promotion.",
  },
  {
    period: "Monthly",
    headline: "Storage pressure is the main predictor for sync degradation.",
    detail: "Capacity plan should prioritize archive growth and snapshot cost control.",
  },
];

const migrationStepBlueprint = [
  {
    id: "lock",
    title: "Lock Source",
    detail: "Freeze non-critical writes and capture migration baseline.",
  },
  {
    id: "snapshot",
    title: "Snapshot",
    detail: "Create rollback checkpoint from source chain data.",
  },
  {
    id: "copy",
    title: "Copy Data",
    detail: "Transfer chain data to target server volumes.",
  },
  {
    id: "verify",
    title: "Verify",
    detail: "Validate hash, block height, and index consistency.",
  },
  {
    id: "cutover",
    title: "Cutover",
    detail: "Switch traffic and monitor error, latency, and lag.",
  },
];

const chainUpdateAutomationSteps = [
  { id: "announce", stage: "Preparation", label: "Request deployment approval in prd_전체_deploy" },
  { id: "verify-image", stage: "Preparation", label: "Verify client version matches Docker image" },
  { id: "yaml-commit", stage: "Preparation", label: "Update yaml version and commit" },
  { id: "alert-off", stage: "Execution", label: "Turn ArgoCD alert monitoring off" },
  { id: "traffic-off", stage: "Execution", label: "Switch traffic Active -> Inactive" },
  { id: "argocd-sync", stage: "Execution", label: "Review DIFF and run ArgoCD sync" },
  { id: "verify-health", stage: "Verification", label: "Check Pod logs and latest block sync" },
  { id: "grafana-delay", stage: "Verification", label: "Confirm Grafana Block Delay Time" },
  { id: "traffic-on", stage: "Verification", label: "Re-enable traffic and send Slack completion" },
];

function chainUpdateTier(serverId) {
  const value = String(serverId || "").toLowerCase();
  if (value.includes("-int-")) return "internal";
  if (value.includes("-svc-")) return "service";
  if (value.includes("-ded-")) return "dedicated";
  return "other";
}

const chainUpdateTierRank = {
  internal: 0,
  service: 1,
  dedicated: 2,
  other: 3,
};

function sortChainUpdateTargets(targets) {
  return [...(targets || [])].sort((a, b) => {
    const ta = chainUpdateTierRank[chainUpdateTier(a.serverId)] ?? 99;
    const tb = chainUpdateTierRank[chainUpdateTier(b.serverId)] ?? 99;
    if (ta !== tb) return ta - tb;
    return String(a.serverId || "").localeCompare(String(b.serverId || ""));
  });
}

function migrationStepTone(status) {
  if (status === "completed") return "stable";
  if (status === "running") return "progress";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "paused") return "neutral";
  return "pending";
}

function formatBadgeLabel(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
}

function protocolSeed(protocol) {
  return String(protocol || "protocol").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "protocol";
}

function protocolMonogram(protocol) {
  const letters = String(protocol || "?").replace(/\([^)]*\)/g, " ").replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!letters) return "?";
  const parts = letters.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function generatedProtocolLogo(protocol) {
  const palette = ["0F6F87", "0F8567", "46548F", "A26A14", "A73B46", "2E7AA9", "5B4A99"];
  const seed = protocolSeed(protocol);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const color = palette[hash % palette.length];
  const mono = protocolMonogram(protocol);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='32' fill='#${color}'/><text x='32' y='37' text-anchor='middle' font-size='21' font-family='Avenir Next, Arial, sans-serif' font-weight='700' fill='white'>${mono}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function ProtocolLogo({ protocol, officialSite }) {
  const domain = siteDomain(officialSite);
  const clearbit = domain ? `https://logo.clearbit.com/${domain}` : "";
  const favicon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : "";
  const generated = useMemo(() => generatedProtocolLogo(protocol), [protocol]);
  const [src, setSrc] = useState(clearbit || favicon || generated);
  const [attemptedFallback, setAttemptedFallback] = useState(false);

  useEffect(() => {
    setSrc(clearbit || favicon || generated);
    setAttemptedFallback(false);
  }, [clearbit, favicon, generated]);

  return (
    <img
      className="protocolLogo"
      src={src}
      alt={`${protocol} logo`}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!attemptedFallback && favicon) {
          setAttemptedFallback(true);
          setSrc(favicon);
          return;
        }
        setSrc(generated);
      }}
    />
  );
}

function ProtocolTable({ items, metadata, onOpenDetail }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "updatedAt", direction: "desc" });
  const query = searchQuery.trim().toLowerCase();
  const filteredItems = useMemo(
    () => items.filter((row) => {
      if (!query) return true;
      const meta = metadata.get(row.protocol) || {};
      return String(row.protocol || "").toLowerCase().includes(query)
        || String(meta.version || "").toLowerCase().includes(query)
        || String(row.githubRepo || "").toLowerCase().includes(query)
        || String(meta.dockerTag || "").toLowerCase().includes(query)
        || String(meta.updatedAt || "").toLowerCase().includes(query);
    }),
    [items, metadata, query],
  );
  const sortedItems = useMemo(
    () => sortRowsByConfig(filteredItems, sortConfig, (row, key) => {
      const meta = metadata.get(row.protocol) || {};
      if (key === "version") return meta.version || "";
      if (key === "github") return githubUrl(row.githubRepo);
      if (key === "docker") return meta.dockerUiUrl || "";
      if (key === "updatedAt") return meta.updatedAt || "";
      return row?.[key] || "";
    }),
    [filteredItems, metadata, sortConfig],
  );

  return (
      <>
      <div className="statusFilters snapshotListFilters chainUpdateSearchFilters">
        <div className="compactSearchRow">
          <label>
            <span>Search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search protocol, version, repo, docker"
            />
          </label>
          <button
            type="button"
            className="compactSearchButton"
            onClick={() => setSearchQuery((prev) => prev.trim())}
          >
            Search
          </button>
        </div>
      </div>
      <div className="tableWrap">
        <table className="unifiedTable">
        <thead>
          <tr>
            <th><SortHeaderButton label="Protocol" columnKey="protocol" sortConfig={sortConfig} onToggle={(key) => setSortConfig((prev) => nextSortConfig(prev, key))} /></th>
            <th><SortHeaderButton label="Version Info" columnKey="version" sortConfig={sortConfig} onToggle={(key) => setSortConfig((prev) => nextSortConfig(prev, key))} /></th>
            <th><SortHeaderButton label="GitHub" columnKey="github" sortConfig={sortConfig} onToggle={(key) => setSortConfig((prev) => nextSortConfig(prev, key))} /></th>
            <th><SortHeaderButton label="Docker" columnKey="docker" sortConfig={sortConfig} onToggle={(key) => setSortConfig((prev) => nextSortConfig(prev, key))} /></th>
            <th><SortHeaderButton label="Updated Date" columnKey="updatedAt" sortConfig={sortConfig} onToggle={(key) => setSortConfig((prev) => nextSortConfig(prev, key, "desc"))} /></th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((client) => {
            const meta = metadata.get(client.protocol) || {};
            const ghHref = githubUrl(client.githubRepo);
            const dockerHref = meta.dockerLinkVisible ? meta.dockerUiUrl : "";
            const dockerTitle = meta.dockerStatus
              ? `${client.protocol} Docker (${meta.dockerStatus})`
              : `${client.protocol} Docker image`;
            return (
              <tr key={client.id} className="clickableRow" onClick={() => onOpenDetail(client.protocol)}>
                <td>
                  <div className="protocolCell">
                    <ProtocolLogo protocol={client.protocol} officialSite={client.officialSite} />
                    <span className="tablePlainText">{client.protocol}</span>
                  </div>
                </td>
                <td>
                  <span className="tag">{meta.version || "n/a"}</span>
                </td>
                <td>
                  {ghHref ? (
                    <a
                      className="emojiLink"
                      href={ghHref}
                      target="_blank"
                      rel="noreferrer"
                      title={`${client.protocol} GitHub`}
                      aria-label={`${client.protocol} GitHub`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span>🐙</span>
                    </a>
                  ) : (
                    <span>-</span>
                  )}
                </td>
                <td>
                  {dockerHref ? (
                    <a
                      className="emojiLink"
                      href={dockerHref}
                      target="_blank"
                      rel="noreferrer"
                      title={dockerTitle}
                      aria-label={dockerTitle}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span>🐳</span>
                    </a>
                  ) : (
                    <span>-</span>
                  )}
                </td>
                <td>{fmtDate(meta.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

function UpdateTargetTable({ state, protocolSiteMap = new Map(), reportStyle = false, onOpenTargetDetail }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "updatedAt", direction: "desc" });

  const payload = state.payload;
  const rows = payload?.items || [];
  const summary = payload?.summary || { protocols: 0, matchedProtocols: 0, totalTargets: 0 };
  const snapshotStamp = payload?.snapshotGeneratedAt ? fmtDate(payload.snapshotGeneratedAt) : "n/a";
  const query = searchQuery.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (!query) return true;
    return String(row.protocol || "").toLowerCase().includes(query)
      || String(row.targetVersion || "").toLowerCase().includes(query)
      || String(row.liveImage || "pending").toLowerCase().includes(query)
      || String(row.argocdSyncStatus || "pending").toLowerCase().includes(query)
      || String(row.network || "").toLowerCase().includes(query)
      || String(row.serverId || "").toLowerCase().includes(query);
  });

  const sortedRows = useMemo(
    () => sortRowsByConfig(filteredRows, sortConfig, (row, key) => row?.[key] || ""),
    [filteredRows, sortConfig],
  );

  const previewRows = sortedRows.slice(0, 300);

  if (state.loading) {
    return <div className="loading">Loading update targets...</div>;
  }

  if (state.error) {
    return <p className="statusLine danger">{state.error}</p>;
  }

  return (
    <section className={reportStyle ? "chainUpdateTableShell" : "panel"}>
      <div className="panelHead panelHeadSplit">
        <div>
          <p>Chain Update Info and Server Status DB joined by normalized protocol-network mapping.</p>
        </div>
        <div className="widgetActionStack">
          <p>
            Snapshot {snapshotStamp} · Matched {summary.matchedProtocols}/{summary.protocols} · Targets {summary.totalTargets}
          </p>
        </div>
      </div>
      <div className="statusFilters snapshotListFilters chainUpdateSearchFilters">
        <label>
          <span>Search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search protocol, version, image, sync status"
          />
        </label>
      </div>
      <div className="tableWrap">
        <table className="unifiedTable">
          <thead>
            <tr>
              <th><SortHeaderButton label="Protocol" columnKey="protocol" sortConfig={sortConfig} onToggle={(key) => setSortConfig((prev) => nextSortConfig(prev, key))} /></th>
              <th><SortHeaderButton label="ArgoCD Sync" columnKey="argocdSyncStatus" sortConfig={sortConfig} onToggle={(key) => setSortConfig((prev) => nextSortConfig(prev, key))} /></th>
              <th><SortHeaderButton label="Target Version" columnKey="targetVersion" sortConfig={sortConfig} onToggle={(key) => setSortConfig((prev) => nextSortConfig(prev, key))} /></th>
              <th><SortHeaderButton label="Live Image" columnKey="liveImage" sortConfig={sortConfig} onToggle={(key) => setSortConfig((prev) => nextSortConfig(prev, key))} /></th>
            </tr>
          </thead>
          <tbody>
            {previewRows.length === 0 ? (
              <tr>
                <td colSpan={4}>No matched targets yet.</td>
              </tr>
            ) : (
              previewRows.map((row, index) => (
                <tr
                  key={`${row.protocol}-${row.network}-${row.serverId}-${index}`}
                  className="clickableRow"
                  onClick={() => onOpenTargetDetail?.(buildUpdateTargetKey(row))}
                >
                  <td>
                    <div className="protocolCell">
                      <ProtocolLogo protocol={row.protocol} officialSite={protocolSiteMap.get(row.protocol) || ""} />
                      <span>{row.protocol}</span>
                    </div>
                  </td>
                  <td><ArgocdSyncStatus value={row.argocdSyncStatus || "pending"} /></td>
                  <td><span className="tag">{row.targetVersion || "n/a"}</span></td>
                  <td>{row.liveImage || "pending"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {sortedRows.length > previewRows.length ? (
        <p className="statusLine">Showing first {previewRows.length} rows of {sortedRows.length} filtered targets.</p>
      ) : null}
      {payload?.unmatchedProtocols?.length ? (
        <p className="statusLine">Unmatched protocols: {payload.unmatchedProtocols.slice(0, 10).join(", ")}{payload.unmatchedProtocols.length > 10 ? " ..." : ""}</p>
      ) : null}
    </section>
  );
}

function ChainUpdateTargetDetail({ target, allTargets, scope, onBack, onRunUpdate }) {
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedServerKey, setSelectedServerKey] = useState("");
  const [workflowState, setWorkflowState] = useState({});
  const [rolloutState, setRolloutState] = useState({
    status: "draft",
    currentIndex: 0,
    servers: {},
    logs: [],
  });

  const protocolTargets = useMemo(() => {
    if (!target) return [];
    return sortChainUpdateTargets((allTargets || []).filter((item) => item.protocol === target.protocol));
  }, [allTargets, target]);

  const selectedTarget = useMemo(
    () => protocolTargets.find((item) => buildUpdateTargetKey(item) === selectedServerKey) || protocolTargets[0] || null,
    [protocolTargets, selectedServerKey],
  );

  const rolloutStorageKey = selectedTarget ? `hyperpulse.chainUpdate.rollout.${selectedTarget.protocol}` : "";

  useEffect(() => {
    if (!protocolTargets.length) {
      setSelectedServerKey("");
      return;
    }
    if (!protocolTargets.some((item) => buildUpdateTargetKey(item) === selectedServerKey)) {
      setSelectedServerKey(buildUpdateTargetKey(protocolTargets[0]));
    }
  }, [protocolTargets, selectedServerKey]);

  useEffect(() => {
    if (!rolloutStorageKey) {
      setWorkflowState({});
      setRolloutState({ status: "draft", currentIndex: 0, servers: {}, logs: [] });
      return;
    }
    try {
      const raw = window.localStorage.getItem(rolloutStorageKey);
      if (!raw) {
        setWorkflowState({});
        setRolloutState({ status: "draft", currentIndex: 0, servers: {}, logs: [] });
        return;
      }
      const parsed = JSON.parse(raw);
      setWorkflowState(parsed.workflowState || {});
      setRolloutState(parsed.rolloutState || { status: "draft", currentIndex: 0, servers: {}, logs: [] });
    } catch {
      setWorkflowState({});
      setRolloutState({ status: "draft", currentIndex: 0, servers: {}, logs: [] });
    }
  }, [rolloutStorageKey]);

  useEffect(() => {
    if (!rolloutStorageKey) return;
    try {
      window.localStorage.setItem(rolloutStorageKey, JSON.stringify({ workflowState, rolloutState }));
    } catch {}
  }, [rolloutStorageKey, workflowState, rolloutState]);

  useEffect(() => {
    if (!selectedTarget) return;
    const serverKey = buildUpdateTargetKey(selectedTarget);
    const hasTargetVersion = !!String(selectedTarget.targetVersion || "").trim();
    const hasLiveImage = !!String(selectedTarget.liveImage || "").trim();
    const imageMatched = hasTargetVersion && hasLiveImage
      ? String(selectedTarget.liveImage).toLowerCase().includes(String(selectedTarget.targetVersion).toLowerCase())
      : false;
    const synced = String(selectedTarget.argocdSyncStatus || "").toLowerCase() === "synced";
    const healthy = String(selectedTarget.argocdHealthStatus || "").toLowerCase() === "healthy";
    setWorkflowState((prev) => {
      const next = { ...prev };
      if (imageMatched) next[`${serverKey}:verify-image`] = true;
      if (synced) next[`${serverKey}:argocd-sync`] = true;
      if (synced && healthy) next[`${serverKey}:verify-health`] = true;
      return next;
    });
  }, [selectedTarget]);

  const selectedServerKeyResolved = selectedTarget ? buildUpdateTargetKey(selectedTarget) : "";

  const completedSteps = useMemo(() => {
    if (!selectedServerKeyResolved) return 0;
    return chainUpdateAutomationSteps.filter((step) => workflowState[`${selectedServerKeyResolved}:${step.id}`]).length;
  }, [selectedServerKeyResolved, workflowState]);

  const currentVersion = selectedTarget?.liveImage || "pending";
  const nextVersion = selectedTarget?.targetVersion || "n/a";

  function markStepPassed(stepId, serverKey = selectedServerKeyResolved) {
    if (!serverKey) return;
    setWorkflowState((prev) => ({ ...prev, [`${serverKey}:${stepId}`]: true }));
  }

  function appendLog(message, level = "info") {
    const line = `${fmtDate(new Date().toISOString())} · ${message}`;
    setRolloutState((prev) => ({
      ...prev,
      logs: [{ line, level }, ...prev.logs].slice(0, 80),
    }));
  }

  function resetRollout() {
    setWorkflowState({});
    setRolloutState({ status: "draft", currentIndex: 0, servers: {}, logs: [] });
    setStatusMessage("");
    setError("");
  }

  async function executeServerUpdate(serverTarget, indexInPlan) {
    const serverKey = buildUpdateTargetKey(serverTarget);
    setRolloutState((prev) => ({
      ...prev,
      status: "running",
      currentIndex: indexInPlan,
      servers: {
        ...prev.servers,
        [serverKey]: { ...(prev.servers[serverKey] || {}), status: "updating" },
      },
    }));

    markStepPassed("announce", serverKey);
    markStepPassed("verify-image", serverKey);
    markStepPassed("yaml-commit", serverKey);
    markStepPassed("alert-off", serverKey);
    markStepPassed("traffic-off", serverKey);
    appendLog(`[${serverTarget.serverId}] Started update execution`);

    try {
      const result = await onRunUpdate(serverTarget);
      markStepPassed("argocd-sync", serverKey);
      markStepPassed("verify-health", serverKey);
      markStepPassed("grafana-delay", serverKey);
      markStepPassed("traffic-on", serverKey);
      setRolloutState((prev) => ({
        ...prev,
        servers: {
          ...prev.servers,
          [serverKey]: { ...(prev.servers[serverKey] || {}), status: "done", message: result?.message || "Done" },
        },
      }));
      appendLog(`[${serverTarget.serverId}] Update passed and verification complete`);
      return true;
    } catch (runError) {
      setRolloutState((prev) => ({
        ...prev,
        status: "failed",
        servers: {
          ...prev.servers,
          [serverKey]: { ...(prev.servers[serverKey] || {}), status: "failed", message: runError.message || "Failed" },
        },
      }));
      appendLog(`[${serverTarget.serverId}] Update failed: ${runError.message || "Unknown error"}`, "danger");
      setError(runError.message || "Failed during rollout");
      return false;
    }
  }

  async function runPlannedRollout() {
    if (!protocolTargets.length || running) return;
    setRunning(true);
    setError("");
    setStatusMessage("");
    appendLog(`Rollout started for ${target.protocol} (${protocolTargets.length} servers)`);
    for (let i = rolloutState.currentIndex; i < protocolTargets.length; i += 1) {
      const ok = await executeServerUpdate(protocolTargets[i], i);
      if (!ok) {
        setRunning(false);
        setStatusMessage(`Rollout paused at ${protocolTargets[i].serverId}`);
        return;
      }
    }
    setRolloutState((prev) => ({ ...prev, status: "completed", currentIndex: protocolTargets.length }));
    setRunning(false);
    setStatusMessage(`Rollout completed for ${target.protocol}.`);
    appendLog(`Rollout completed for ${target.protocol}`);
  }

  if (!target) {
    return (
      <section className="detailShell opsDetailShell">
        <div className="detailHeader">
          <button type="button" className="ghostButton" onClick={onBack}>Back to Chain Update</button>
          <h2>Target Detail</h2>
        </div>
        <section className="panel">
          <div className="panelHead">
            <h3>Target not found</h3>
            <p>This target is no longer available in the current dataset.</p>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="detailShell opsDetailShell">
      <div className="detailHeader">
        <button type="button" className="ghostButton" onClick={onBack}>Back to Chain Update</button>
        <h2>{target.protocol} Update Orchestrator</h2>
      </div>
      <div className="breadcrumbLine">chain-update &gt; {target.protocol} &gt; rollout</div>

      <div className="scopeBadgeRow">
        <span className="badge badge-neutral">{scope.environment}</span>
        <span className="badge badge-neutral">{scope.cluster}</span>
        <span className="badge badge-neutral">{scope.region}</span>
        <span className="badge badge-neutral">{scope.chain}</span>
        <span className="badge badge-neutral">{scope.timeRange}</span>
      </div>

      <section className="panel chainUpdateAutomationPanel">
        <div className="panelHead panelHeadSplit">
          <div>
            <h3>Upgrade Summary</h3>
            <p>Current and target versions with server rollout plan.</p>
          </div>
          <span className={`badge badge-${formatBadgeLabel(rolloutState.status || "draft")}`}>Run {rolloutState.status}</span>
        </div>
        <div className="chainUpdateVersionDiff">
          <span className="badge badge-neutral">Current {currentVersion}</span>
          <span className="badge badge-neutral">Target {nextVersion}</span>
          <span className="badge badge-neutral">Servers {protocolTargets.length}</span>
        </div>
      </section>

      <section className="panel chainUpdateAutomationPanel">
        <div className="panelHead panelHeadSplit">
          <div>
            <h3>Server Rollout Planner</h3>
            <p>Execution order follows Internal -&gt; Service -&gt; Dedicated.</p>
          </div>
          <div className="chainUpdateAutomationActions">
            <button type="button" className="widgetActionButton" onClick={runPlannedRollout} disabled={running || !protocolTargets.length}>Run Planned Rollout</button>
            <button type="button" className="widgetActionButton ghost" onClick={resetRollout} disabled={running}>Reset</button>
          </div>
        </div>
        <div className="tableWrap chainUpdatePlanTableWrap">
          <table className="unifiedTable">
            <thead>
              <tr>
                <th>Order</th>
                <th>Tier</th>
                <th>Server</th>
                <th>Current</th>
                <th>Target</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {protocolTargets.map((item, index) => {
                const key = buildUpdateTargetKey(item);
                const state = rolloutState.servers[key]?.status || (index < rolloutState.currentIndex ? "done" : "pending");
                return (
                  <tr key={key} className={`clickableRow ${selectedServerKeyResolved === key ? "rowSelected" : ""}`} onClick={() => setSelectedServerKey(key)}>
                    <td>{index + 1}</td>
                    <td>{chainUpdateTier(item.serverId)}</td>
                    <td>{item.serverId}</td>
                    <td>{item.liveImage || "pending"}</td>
                    <td>{item.targetVersion || "n/a"}</td>
                    <td><span className={`badge badge-${formatBadgeLabel(state)}`}>{state}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel chainUpdateAutomationPanel">
        <div className="panelHead panelHeadSplit">
          <div>
            <h3>Step Checklist · {selectedTarget?.serverId || "-"}</h3>
            <p>Operational checklist with automatic pass on execution results.</p>
          </div>
          <span className="badge badge-neutral">Progress {completedSteps}/{chainUpdateAutomationSteps.length}</span>
        </div>
        <div className="chainUpdateAutomationChecklist">
          {chainUpdateAutomationSteps.map((step) => {
            const passed = !!workflowState[`${selectedServerKeyResolved}:${step.id}`];
            return (
              <div key={step.id} className="chainUpdateAutomationStep">
                <span><strong>{step.stage}</strong> - {step.label}</span>
                <div className="chainUpdateAutomationActions">
                  <span className={`badge badge-${passed ? "healthy" : "pending"}`}>{passed ? "Passed" : "Pending"}</span>
                  <button
                    type="button"
                    className="widgetActionButton ghost"
                    disabled={passed || running || !selectedServerKeyResolved}
                    onClick={() => markStepPassed(step.id)}
                  >
                    Mark pass
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel chainUpdateAutomationPanel">
        <div className="panelHead">
          <h3>Execution Timeline</h3>
        </div>
        {rolloutState.logs.length ? (
          <div className="chainUpdateTimeline">
            {rolloutState.logs.map((entry) => (
              <p key={entry.line} className={`statusLine ${entry.level === "danger" ? "danger" : ""}`}>{entry.line}</p>
            ))}
          </div>
        ) : (
          <p className="statusLine">No execution logs yet.</p>
        )}
        <div className="chainUpdateAutomationSlack">
          <p className="widgetMeta">Slack start template: alert off & 하이퍼 노드 비활성화 & 업데이트 진행합니다.</p>
          <p className="widgetMeta">Slack end template: 모든 작업 완료되었습니다.</p>
        </div>
      </section>

      {statusMessage ? <p className="statusLine">{statusMessage}</p> : null}
      {error ? <p className="statusLine danger">{error}</p> : null}
    </section>
  );
}

function PageSubnav({ items, activeId, onChange }) {
  return (
    <nav className="subpageNav" aria-label="In-page navigation">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`subpageTab ${activeId === item.id ? "active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          <span className="subpageLabel">{item.label}</span>
          <span className="subpageDesc">{item.desc}</span>
        </button>
      ))}
    </nav>
  );
}

function ActionButtons({ actions, onAction }) {
  return (
    <div className="quickActions">
      {actions.map((action) => (
        <button key={action.label} type="button" className="quickActionButton" onClick={() => onAction(action)}>
          {action.label}
        </button>
      ))}
    </div>
  );
}

function OpsDetailPage({ entity, entityId, scope, onBack, statusItems, alertItems, reportItems }) {
  const detailName = entityId.replace(/[-_]/g, " ");
  const titleCaseName = detailName.charAt(0).toUpperCase() + detailName.slice(1);
  const serverRecord = entity === "server"
    ? statusItems.find((item) => item.idc.toLowerCase() === entityId.toLowerCase()) || null
    : null;
  const incidentRecord = entity === "incident"
    ? (alertItems || []).find((item) => item.id.toLowerCase() === entityId.toLowerCase()) || null
    : null;
  const reportRecord = entity === "report"
    ? (reportItems || []).find((item) => item.id.toLowerCase() === entityId.toLowerCase()) || null
    : null;
  const serverPods = serverRecord?.nodes || [];
  const [serverPodSort, setServerPodSort] = useState({ key: "chain", direction: "asc" });
  const sortedServerPods = useMemo(
    () => sortRowsByConfig(serverPods, serverPodSort, (row, key) => row?.[key] || ""),
    [serverPods, serverPodSort],
  );
  const installedClients = Array.from(new Set(serverPods.map((node) => String(node.client || "-").trim()).filter(Boolean)));

  return (
    <section className="detailShell opsDetailShell">
      <div className="detailHeader">
        <button type="button" className="ghostButton" onClick={onBack}>Back to dashboard</button>
        <h2>{titleCaseName} Detail</h2>
      </div>
      <div className="breadcrumbLine">{entity} &gt; {titleCaseName}</div>

      <div className="scopeBadgeRow">
        <span className="badge badge-neutral">{scope.environment}</span>
        <span className="badge badge-neutral">{scope.cluster}</span>
        <span className="badge badge-neutral">{scope.region}</span>
        <span className="badge badge-neutral">{scope.chain}</span>
        <span className="badge badge-neutral">{scope.timeRange}</span>
      </div>

      {serverRecord ? (
        <section className="panel">
          <div className="panelHead">
            <h3>Installed Clients and Pods</h3>
            <p>Server {serverRecord.idc.toUpperCase()} client footprint and pod inventory.</p>
          </div>
          <div className="serverDetailChips">
            {installedClients.map((client) => (
              <span key={client} className="badge badge-neutral">Client: {client}</span>
            ))}
            <span className="badge badge-neutral">Pods: {serverPods.length}</span>
          </div>
          <div className="tableWrap">
            <table className="unifiedTable">
              <thead>
                <tr>
                  <th><SortHeaderButton label="Chain" columnKey="chain" sortConfig={serverPodSort} onToggle={(key) => setServerPodSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Pod" columnKey="node" sortConfig={serverPodSort} onToggle={(key) => setServerPodSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Client" columnKey="client" sortConfig={serverPodSort} onToggle={(key) => setServerPodSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="K8s Resources" columnKey="resources" sortConfig={serverPodSort} onToggle={(key) => setServerPodSort((prev) => nextSortConfig(prev, key))} /></th>
                </tr>
              </thead>
              <tbody>
                {sortedServerPods.map((node) => (
                  <tr key={`${node.chain}-${node.node}`}>
                    <td>{node.chain}</td>
                    <td>{node.node}</td>
                    <td>{node.client}</td>
                    <td>{node.resources}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : incidentRecord ? (
        <section className="panel">
          <div className="panelHead">
            <h3>Incident Detail</h3>
            <p>{incidentRecord.id} incident context.</p>
          </div>
          <div className="tableWrap">
            <table className="unifiedTable">
              <tbody>
                <tr><th>ID</th><td>{incidentRecord.id}</td></tr>
                <tr><th>Occurred At</th><td>{incidentRecord.occurredAt || incidentRecord.occurredOn}</td></tr>
                <tr><th>Title</th><td>{incidentRecord.title}</td></tr>
                <tr><th>Chain</th><td>{incidentRecord.chain}</td></tr>
                <tr><th>Server</th><td>{incidentRecord.server}</td></tr>
                <tr><th>Severity</th><td>{incidentRecord.severity}</td></tr>
                <tr><th>State</th><td>{incidentRecord.state}</td></tr>
                <tr><th>Impact</th><td>{incidentRecord.impact}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : reportRecord ? (
        <section className="panel">
          <div className="panelHead">
            <h3>Report Detail</h3>
            <p>{reportRecord.id} report context.</p>
          </div>
          <div className="tableWrap">
            <table className="unifiedTable">
              <tbody>
                <tr><th>ID</th><td>{reportRecord.id}</td></tr>
                <tr><th>Type</th><td>{reportRecord.reportType}</td></tr>
                <tr><th>Date</th><td>{reportRecord.reportedOn}</td></tr>
                <tr><th>Chain</th><td>{reportRecord.chain}</td></tr>
                <tr><th>Server</th><td>{reportRecord.server}</td></tr>
                <tr><th>Incidents</th><td>{reportRecord.incidents}</td></tr>
                <tr><th>Resolved SLA</th><td>{reportRecord.resolvedWithinSla}</td></tr>
                <tr><th>Status</th><td>{reportRecord.status}</td></tr>
                <tr><th>Owner</th><td>{reportRecord.owner}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panelHead">
            <h3>Server Detail</h3>
            <p>No server inventory rows matched this target.</p>
          </div>
        </section>
      )}
    </section>
  );
}

function OperationsModal({ modalState, onClose }) {
  if (!modalState.open) return null;

  return (
    <div className="modalBackdrop">
      <button type="button" className="modalBackdropDismiss" onClick={onClose} aria-label="Close dialog" />
      <section className="modalCard" role="dialog" aria-modal="true" aria-labelledby="ops-modal-title">
        <div className="modalHead">
          <h3 id="ops-modal-title">{modalState.title}</h3>
          <button type="button" className="modalCloseButton" onClick={onClose} aria-label="Close dialog">
            Close
          </button>
        </div>
        {modalState.summary ? <p className="modalSummary">{modalState.summary}</p> : null}
        {modalState.bullets?.length ? (
          <ul className="modalList">
            {modalState.bullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {modalState.footer ? <p className="modalFooter">{modalState.footer}</p> : null}
      </section>
    </div>
  );
}

function ReviewDetail({ protocol, onBack }) {
  const [state, setState] = useState({
    loading: false,
    error: "",
    statusMessage: "Preparing analysis...",
    payload: null,
    selectedReportId: "",
  });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setState({
        loading: true,
        error: "",
        statusMessage: "Checking latest review report...",
        payload: null,
        selectedReportId: "",
      });

      try {
        const response = await fetch(`./api/client-review?protocol=${encodeURIComponent(protocol)}`);
        if (response.status === 401) {
          const next = `${window.location.pathname}${window.location.hash || ""}`;
          window.location.assign(`./login.html?next=${encodeURIComponent(next)}`);
          return;
        }
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load review report");
        }
        if (cancelled) return;

        setState((prev) => ({
          ...prev,
          loading: false,
          payload,
          statusMessage: payload.message || "Review report is ready",
          selectedReportId: payload.report?.id || "",
        }));
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error.message || "Failed to run analysis",
          statusMessage: error.message || "Failed to run analysis",
        }));
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [protocol]);

  const history = state.payload?.recentReports || [];
  const selectedReport = useMemo(() => {
    if (!state.payload) return null;
    return history.find((item) => item.id === state.selectedReportId) || state.payload.report || null;
  }, [history, state.payload, state.selectedReportId]);
  const reportSections = useMemo(() => parseReport(selectedReport?.markdown || ""), [selectedReport?.markdown]);

  return (
    <section className="detailShell">
      <div className="detailHeader">
        <button type="button" className="ghostButton" onClick={onBack}>Back to Protocols</button>
        <h2>{protocol} Review</h2>
      </div>

      <div className="metaGrid">
        <article className="metaCard">
          <h3>Protocol</h3>
          <p>{state.payload?.protocol || protocol || "-"}</p>
        </article>
        <article className="metaCard">
          <h3>RSS Entry</h3>
          <p>{state.payload?.rss?.title || "RSS entry unavailable"}</p>
        </article>
        <article className="metaCard">
          <h3>Head Commit</h3>
          <p>{selectedReport?.headSha || "-"}</p>
        </article>
      </div>

      <p className={`statusLine ${state.error ? "danger" : ""}`}>{state.statusMessage}</p>

      <div className="detailGrid">
        <section className="panel">
          <div className="panelHead">
            <h3>LLM Change Review</h3>
            <p>
              {selectedReport
                ? `Generated: ${fmtDate(selectedReport.generatedAt)} | Status: ${state.payload?.status || "unknown"}`
                : "No report yet."}
            </p>
          </div>
          {selectedReport ? (
            <div className="reportCanvas">
              {reportSections.map((section) => (
                <article key={section.title} className="reportCard">
                  <h4>{section.title}</h4>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <pre className="reportView">{state.loading ? "Loading report..." : "No report generated."}</pre>
          )}
        </section>

        <section className="panel">
          <div className="panelHead">
            <h3>Recent Version History</h3>
            <p>{history.length > 0 ? `Showing ${history.length} recent entries` : "No history"}</p>
          </div>
          <div className="historyList">
            {history.length === 0 ? (
              <div className="historyEmpty">No report history available.</div>
            ) : (
              history.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`historyItem ${item.id === state.selectedReportId ? "active" : ""}`}
                  onClick={() => setState((prev) => ({ ...prev, selectedReportId: item.id }))}
                >
                  <p><strong>{item.rssTitle || "(unknown)"}</strong></p>
                  <p>{fmtDate(item.githubUpdatedAt || item.updatedAt || item.generatedAt)}</p>
                  <p>Head: {item.headSha || "-"}</p>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

export function App() {
  const initialThemeState = useMemo(() => resolveInitialThemeState(), []);
  const [theme, setTheme] = useState(initialThemeState.theme);
  const [followSystemTheme, setFollowSystemTheme] = useState(initialThemeState.followSystem);
  const [clients, setClients] = useState([]);
  const [metadata, setMetadata] = useState(new Map());
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [route, setRoute] = useState(parseHashRoute());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeSubpage, setActiveSubpage] = useState(PAGE_SUBPAGES.home[0].id);
  const [selectedSnapshotProtocol, setSelectedSnapshotProtocol] = useState("");
  const [selectedSnapshotServer, setSelectedSnapshotServer] = useState(snapshotServerOptions[0]);
  const [selectedSnapshotSource, setSelectedSnapshotSource] = useState("");
  const [selectedSnapshotRestoreTarget, setSelectedSnapshotRestoreTarget] = useState("");
  const [snapshotOperationMode, setSnapshotOperationMode] = useState("clone");
  const [snapshotSearch, setSnapshotSearch] = useState("");
  const [serverStatusState, setServerStatusState] = useState({
    loading: true,
    error: "",
    payload: null,
  });
  const [updateTargetsState, setUpdateTargetsState] = useState({
    loading: true,
    error: "",
    payload: null,
  });
  const [alertsState, setAlertsState] = useState({
    loading: true,
    error: "",
    items: [],
  });
  const [alertReportsState, setAlertReportsState] = useState({
    loading: true,
    error: "",
    items: [],
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [serverSearch, setServerSearch] = useState("");
  const [alertDateFilter, setAlertDateFilter] = useState("all");
  const [alertServerFilter, setAlertServerFilter] = useState("all");
  const [alertChainFilter, setAlertChainFilter] = useState("all");
  const alertsLogItems = alertsState.items;
  const alertReportRecords = alertReportsState.items;
  const [reportTypeFilter, setReportTypeFilter] = useState("all");
  const [reportStatusFilter, setReportStatusFilter] = useState("all");
  const [reportDateFilter, setReportDateFilter] = useState("all");
  const [statusTableSort, setStatusTableSort] = useState({ key: "idc", direction: "asc" });
  const [alertsTableSort, setAlertsTableSort] = useState({ key: "occurredAt", direction: "desc" });
  const [reportsTableSort, setReportsTableSort] = useState({ key: "reportedOn", direction: "desc" });
  const [migrationTableSort, setMigrationTableSort] = useState({ key: "protocol", direction: "asc" });
  const [snapshotTableSort, setSnapshotTableSort] = useState({ key: "protocol", direction: "asc" });
  const [globalScope, setGlobalScope] = useState(route.scope || DEFAULT_SCOPE);
  const [modalState, setModalState] = useState({
    open: false,
    title: "",
    summary: "",
    bullets: [],
    footer: "",
  });
  const [migrationTargetServer, setMigrationTargetServer] = useState("");
  const [migrationExecutionServer, setMigrationExecutionServer] = useState("");
  const [migrationSelectedChain, setMigrationSelectedChain] = useState("");
  const [migrationServerMenuOpen, setMigrationServerMenuOpen] = useState(false);
  const [migrationExecutionMenuOpen, setMigrationExecutionMenuOpen] = useState(false);
  const [migrationAck, setMigrationAck] = useState(false);
  const [migrationJob, setMigrationJob] = useState(null);
  const [migrationTimeline, setMigrationTimeline] = useState([]);
  const statusItems = serverStatusState.payload?.items || [];
  const protocolSiteMap = useMemo(
    () => new Map(clients.map((client) => [client.protocol, client.officialSite || ""])),
    [clients],
  );
  const healthyServices = statusItems.filter((item) => item.status === "Healthy").length;
  const activeAlerts = alertsLogItems.filter((item) => String(item.state || "").toLowerCase() !== "resolved").length;
  const criticalAlerts = alertsLogItems.filter((item) => item.severity === "Critical").length;
  const totalChains = Number(serverStatusState.payload?.summary?.totalChains || statusItems.reduce((sum, item) => sum + item.chains, 0));
  const statusFilterOptions = useMemo(
    () => ["all", ...Array.from(new Set(statusItems.map((item) => item.status).filter(Boolean)))],
    [statusItems],
  );
  const regionFilterOptions = useMemo(
    () => ["all", ...Array.from(new Set(statusItems.map((item) => item.region).filter(Boolean)))],
    [statusItems],
  );
  const filteredStatusItems = useMemo(() => {
    const query = serverSearch.trim().toLowerCase();
    return statusItems.filter((item) => {
      const statusOk = statusFilter === "all" || item.status === statusFilter;
      const regionOk = regionFilter === "all" || item.region === regionFilter;
      const searchOk = !query
        || item.idc.toLowerCase().includes(query)
        || String(item.region || "").toLowerCase().includes(query);
      return statusOk && regionOk && searchOk;
    });
  }, [regionFilter, serverSearch, statusFilter, statusItems]);
  const sortedStatusItems = useMemo(
    () => sortRowsByConfig(filteredStatusItems, statusTableSort, (row, key) => row?.[key] ?? ""),
    [filteredStatusItems, statusTableSort],
  );
  const currentPage = route.type === "page" ? route.page : "home";
  const currentPageMeta = HOME_PAGES.find((item) => item.id === currentPage) || HOME_PAGES[0];
  const availableSubpages = PAGE_SUBPAGES[currentPage] || [];
  const activeSubpageId = availableSubpages.some((item) => item.id === activeSubpage)
    ? activeSubpage
    : (availableSubpages[0]?.id || "");
  const alertDateOptions = useMemo(
    () => ["all", ...Array.from(new Set(alertsLogItems.map((item) => item.occurredOn).filter(Boolean))).sort((a, b) => b.localeCompare(a))],
    [alertsLogItems],
  );
  const alertServerOptions = useMemo(
    () => ["all", ...Array.from(new Set(alertsLogItems.map((item) => item.server).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [alertsLogItems],
  );
  const alertChainOptions = useMemo(
    () => ["all", ...Array.from(new Set(alertsLogItems.map((item) => item.chain).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [alertsLogItems],
  );
  const filteredAlerts = useMemo(
    () => alertsLogItems
      .filter((item) => {
        const dateOk = alertDateFilter === "all" || item.occurredOn === alertDateFilter;
        const serverOk = alertServerFilter === "all" || item.server === alertServerFilter;
        const chainOk = alertChainFilter === "all" || item.chain === alertChainFilter;
        return dateOk && serverOk && chainOk;
      }),
    [alertChainFilter, alertDateFilter, alertServerFilter, alertsLogItems],
  );
  const sortedAlerts = useMemo(
    () => sortRowsByConfig(filteredAlerts, alertsTableSort, (row, key) => {
      if (key === "occurredAt") return row.occurredAt || row.occurredOn || "";
      return row?.[key] ?? "";
    }),
    [alertsTableSort, filteredAlerts],
  );
  const filteredOpenAlerts = filteredAlerts.filter((item) => item.state !== "Resolved").length;
  const filteredCriticalAlerts = filteredAlerts.filter((item) => item.severity === "Critical").length;
  const effectiveUpdateTargetsState = updateTargetsState;
  const reportTypeOptions = useMemo(
    () => ["all", ...Array.from(new Set(alertReportRecords.map((item) => item.reportType).filter(Boolean)))],
    [alertReportRecords],
  );
  const reportStatusOptions = useMemo(
    () => ["all", ...Array.from(new Set(alertReportRecords.map((item) => item.status).filter(Boolean)))],
    [alertReportRecords],
  );
  const reportDateOptions = useMemo(
    () => ["all", ...Array.from(new Set(alertReportRecords.map((item) => item.reportedOn).filter(Boolean))).sort((a, b) => b.localeCompare(a))],
    [alertReportRecords],
  );
  const filteredAlertReportRecords = useMemo(
    () => alertReportRecords.filter((item) => {
      const typeOk = reportTypeFilter === "all" || item.reportType === reportTypeFilter;
      const statusOk = reportStatusFilter === "all" || item.status === reportStatusFilter;
      const dateOk = reportDateFilter === "all" || item.reportedOn === reportDateFilter;
      return typeOk && statusOk && dateOk;
    }),
    [alertReportRecords, reportDateFilter, reportStatusFilter, reportTypeFilter],
  );
  const sortedAlertReports = useMemo(
    () => sortRowsByConfig(filteredAlertReportRecords, reportsTableSort, (row, key) => row?.[key] ?? ""),
    [filteredAlertReportRecords, reportsTableSort],
  );
  const migrationServers = useMemo(
    () => statusItems.map((item, index) => ({
      id: item.idc,
      label: String(item.idc || "server").toUpperCase(),
      region: item.region || "unknown",
      status: item.status || "Unknown",
      freeStorageTb: 6 + (index % 4) * 2,
      cpuHeadroomPct: 24 + (index % 5) * 8,
      iopsTier: ["standard", "high", "premium", "ultra"][index % 4],
    })),
    [statusItems],
  );
  const migrationChains = useMemo(() => {
    if (!clients.length) return [];
    const storagePool = [1.1, 1.6, 2.4, 3.2, 4.1, 5.4];
    const syncLagPool = [2, 5, 8, 11, 14, 17];
    return clients.map((client, index) => {
      const sourceServer = migrationServers.length
        ? migrationServers[index % migrationServers.length].id
        : "idc-1";
      const meta = metadata.get(client.protocol) || {};
      return {
        id: `mig-${client.id || index}`,
        protocol: client.protocol,
        officialSite: client.officialSite || "",
        version: meta.version || "n/a",
        sourceServer,
        requiredStorageTb: storagePool[index % storagePool.length],
        estimatedMinutes: 30 + (index % 6) * 12,
        syncLagBlocks: syncLagPool[index % syncLagPool.length],
      };
    });
  }, [clients, metadata, migrationServers]);
  const migrationSourceServer = migrationServers.find((item) => item.id === migrationTargetServer) || null;
  const migrationServer = migrationServers.find((item) => item.id === migrationExecutionServer) || null;
  const migrationExecutionOptions = useMemo(
    () => migrationServers.filter((item) => item.id !== migrationTargetServer),
    [migrationServers, migrationTargetServer],
  );
  const migrationCandidateChains = useMemo(
    () => migrationChains.filter((item) => item.sourceServer === migrationTargetServer),
    [migrationChains, migrationTargetServer],
  );
  const sortedMigrationCandidateChains = useMemo(
    () => sortRowsByConfig(migrationCandidateChains, migrationTableSort, (row, key) => row?.[key] ?? ""),
    [migrationCandidateChains, migrationTableSort],
  );
  const selectedMigrationChain = migrationCandidateChains.find((item) => item.id === migrationSelectedChain) || null;
  const migrationPrecheck = useMemo(() => {
    if (!migrationServer || !selectedMigrationChain) return null;
    const storagePass = migrationServer.freeStorageTb >= selectedMigrationChain.requiredStorageTb;
    const headroomPass = migrationServer.cpuHeadroomPct >= 28;
    const lagPass = selectedMigrationChain.syncLagBlocks <= 15;
    const checks = [
      {
        id: "storage",
        label: "Storage capacity",
        detail: `${migrationServer.freeStorageTb.toFixed(1)} TiB free / ${selectedMigrationChain.requiredStorageTb.toFixed(1)} TiB required`,
        pass: storagePass,
      },
      {
        id: "headroom",
        label: "CPU headroom",
        detail: `${migrationServer.cpuHeadroomPct}% available on ${migrationServer.label}`,
        pass: headroomPass,
      },
      {
        id: "sync",
        label: "Source sync lag",
        detail: `${selectedMigrationChain.syncLagBlocks} blocks behind`,
        pass: lagPass,
      },
    ];
    return {
      pass: checks.every((item) => item.pass),
      riskLevel: checks.filter((item) => !item.pass).length > 1 ? "High" : (checks.some((item) => !item.pass) ? "Medium" : "Low"),
      checks,
    };
  }, [migrationServer, selectedMigrationChain]);

  const openModal = (config) => {
    setModalState({
      open: true,
      title: config.title || "Operation details",
      summary: config.summary || "",
      bullets: config.bullets || [],
      footer: config.footer || "",
    });
  };

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, open: false }));
  };

  async function loadUpdateTargets(keepPayload = false) {
    setUpdateTargetsState((prev) => ({
      loading: true,
      error: "",
      payload: keepPayload ? prev.payload : null,
    }));
    try {
      const response = await fetch("./api/chain-update-targets");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load update targets");
      }
      setUpdateTargetsState({ loading: false, error: "", payload });
    } catch (loadError) {
      setUpdateTargetsState({ loading: false, error: loadError.message || "Failed to load update targets", payload: null });
    }
  }

  async function runUpdateForTarget(target) {
    if (!target) {
      throw new Error("No update target selected");
    }

    const response = await fetch("./api/chain-update-targets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocol: target.protocol,
        network: target.network,
        serverId: target.serverId,
        hostName: target.hostName,
        targetVersion: target.targetVersion,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Failed to run server update");
    }

    await loadUpdateTargets(true);
    return { message: payload.message || `Update requested for ${target.serverId}.` };
  }

  function resetMigrationSelection() {
    setMigrationSelectedChain("");
    setMigrationAck(false);
    setMigrationJob(null);
    setMigrationTimeline([]);
  }

  function startMigrationJob() {
    if (!migrationServer || !selectedMigrationChain || !migrationPrecheck?.pass || !migrationAck) return;
    const createdAt = new Date().toISOString();
    const steps = migrationStepBlueprint.map((step, index) => ({
      ...step,
      status: index === 0 ? "running" : "pending",
    }));
    setMigrationJob({
      id: `MJ-${Date.now()}`,
      status: "running",
      createdAt,
      mode: "clone",
      targetServer: migrationServer.id,
      chainId: selectedMigrationChain.id,
      steps,
    });
    setMigrationTimeline([
      `${fmtDate(createdAt)} · Job created for ${selectedMigrationChain.protocol} -> ${migrationServer.label}`,
      `${fmtDate(createdAt)} · ${steps[0].title} started`,
    ]);
  }

  function pauseMigrationJob() {
    setMigrationJob((prev) => {
      if (!prev || prev.status !== "running") return prev;
      const steps = prev.steps.map((step) => (step.status === "running" ? { ...step, status: "paused" } : step));
      return { ...prev, status: "paused", steps };
    });
    setMigrationTimeline((prev) => [`${fmtDate(new Date().toISOString())} · Job paused by operator`, ...prev]);
  }

  function resumeMigrationJob() {
    setMigrationJob((prev) => {
      if (!prev || prev.status !== "paused") return prev;
      const pausedIndex = prev.steps.findIndex((step) => step.status === "paused");
      const steps = prev.steps.map((step, index) => {
        if (index === pausedIndex) return { ...step, status: "running" };
        return step;
      });
      return { ...prev, status: "running", steps };
    });
    setMigrationTimeline((prev) => [`${fmtDate(new Date().toISOString())} · Job resumed`, ...prev]);
  }

  function rollbackMigrationJob() {
    setMigrationJob((prev) => {
      if (!prev || prev.status === "completed" || prev.status === "rolled_back") return prev;
      const steps = prev.steps.map((step) => ({
        ...step,
        status: step.status === "completed" ? "completed" : "cancelled",
      }));
      return { ...prev, status: "rolled_back", steps };
    });
    setMigrationTimeline((prev) => [`${fmtDate(new Date().toISOString())} · Rollback requested`, ...prev]);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!followSystemTheme || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event) => setTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [followSystemTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (followSystemTheme) {
      try {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } catch {}
      return;
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [followSystemTheme, theme]);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHashRoute());
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) {
      setPageRoute("home", DEFAULT_SCOPE);
    }
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    setGlobalScope(route.scope || DEFAULT_SCOPE);
  }, [route.scope]);

  useEffect(() => {
    if (route.type !== "page") return;
    const defaultSubpage = PAGE_SUBPAGES[currentPage]?.[0]?.id || "";
    setActiveSubpage(defaultSubpage);
    setModalState((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, [currentPage, route.type]);

  useEffect(() => {
    if (!modalState.open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setModalState((prev) => ({ ...prev, open: false }));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalState.open]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    document.body.classList.add("bodyNavLocked");
    return () => {
      document.body.classList.remove("bodyNavLocked");
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [mdText, snapshotResponse] = await Promise.all([
          fetch("./list.md").then((r) => {
            if (!r.ok) throw new Error("Failed to load list.md");
            return r.text();
          }),
          fetch("./data/snapshot.json").catch(() => null),
        ]);

        const parsedClients = extractCsvFromMarkdown(mdText);
        const nextMap = new Map();
        let generated = "";

        if (snapshotResponse && snapshotResponse.ok) {
          const snapshot = await snapshotResponse.json();
          for (const item of snapshot.items || []) {
            nextMap.set(item.protocol, {
              version: item.version || "n/a",
              updatedAt: item.updatedAt || null,
              dockerTag: item.dockerTag || null,
              dockerLinkVisible: Boolean(item.dockerLinkVisible),
              dockerUiUrl: item.dockerUiUrl || "",
              dockerStatus: item.dockerStatus || null,
            });
          }
          generated = snapshot.generatedAt || "";
        }

        parsedClients.sort((a, b) => {
          const ta = new Date(nextMap.get(a.protocol)?.updatedAt || 0).getTime();
          const tb = new Date(nextMap.get(b.protocol)?.updatedAt || 0).getTime();
          if (tb !== ta) return tb - ta;
          return a.protocol.localeCompare(b.protocol);
        });

        if (cancelled) return;
        setClients(parsedClients);
        setMetadata(nextMap);
        setSnapshotGeneratedAt(generated);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError.message || "Failed to load protocols");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadServerStatus() {
      setServerStatusState({ loading: true, error: "", payload: null });
      try {
        const response = await fetch("./api/server-status");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load server status");
        }
        if (cancelled) return;
        setServerStatusState({ loading: false, error: "", payload });
      } catch (loadError) {
        if (cancelled) return;
        setServerStatusState({ loading: false, error: loadError.message || "Failed to load server status", payload: null });
      }
    }
    loadServerStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadAlerts() {
      setAlertsState({ loading: true, error: "", items: [] });
      try {
        const response = await fetch("./api/alerts-log");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load alerts log");
        if (cancelled) return;
        setAlertsState({ loading: false, error: "", items: Array.isArray(payload.items) ? payload.items : [] });
      } catch (loadError) {
        if (cancelled) return;
        setAlertsState({ loading: false, error: loadError.message || "Failed to load alerts log", items: [] });
      }
    }
    loadAlerts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadAlertReports() {
      setAlertReportsState({ loading: true, error: "", items: [] });
      try {
        const response = await fetch("./api/alerts-reports");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load alerts reports");
        if (cancelled) return;
        setAlertReportsState({ loading: false, error: "", items: Array.isArray(payload.items) ? payload.items : [] });
      } catch (loadError) {
        if (cancelled) return;
        setAlertReportsState({ loading: false, error: loadError.message || "Failed to load alerts reports", items: [] });
      }
    }
    loadAlertReports();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTargets() {
      try {
        setUpdateTargetsState({ loading: true, error: "", payload: null });
        const response = await fetch("./api/chain-update-targets");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load update targets");
        if (cancelled) return;
        setUpdateTargetsState({ loading: false, error: "", payload });
      } catch (loadError) {
        if (cancelled) return;
        setUpdateTargetsState({ loading: false, error: loadError.message || "Failed to load update targets", payload: null });
      }
    }
    loadTargets();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!migrationServers.length) return;
    if (!migrationTargetServer || !migrationServers.some((item) => item.id === migrationTargetServer)) {
      setMigrationTargetServer(migrationServers[0].id);
    }
  }, [migrationServers, migrationTargetServer]);

  useEffect(() => {
    if (!migrationExecutionOptions.length) {
      setMigrationExecutionServer("");
      return;
    }
    if (!migrationExecutionServer || !migrationExecutionOptions.some((item) => item.id === migrationExecutionServer)) {
      setMigrationExecutionServer(migrationExecutionOptions[0].id);
    }
  }, [migrationExecutionOptions, migrationExecutionServer]);

  useEffect(() => {
    if (!migrationSelectedChain) return;
    if (!migrationCandidateChains.some((item) => item.id === migrationSelectedChain)) {
      setMigrationSelectedChain("");
      setMigrationAck(false);
    }
  }, [migrationCandidateChains, migrationSelectedChain]);

  useEffect(() => {
    if (!migrationJob || migrationJob.status !== "running") return undefined;
    const timer = window.setInterval(() => {
      setMigrationJob((prev) => {
        if (!prev || prev.status !== "running") return prev;
        const runningIndex = prev.steps.findIndex((step) => step.status === "running");
        if (runningIndex < 0) return prev;
        const nextSteps = prev.steps.map((step, index) => {
          if (index < runningIndex) return step;
          if (index === runningIndex) return { ...step, status: "completed" };
          if (index === runningIndex + 1) return { ...step, status: "running" };
          return step;
        });
        const completed = runningIndex + 1 >= prev.steps.length;
        const nowIso = new Date().toISOString();
        const finishedStep = prev.steps[runningIndex];
        const nextStep = prev.steps[runningIndex + 1];
        setMigrationTimeline((timeline) => {
          const updates = [`${fmtDate(nowIso)} · ${finishedStep.title} completed`];
          if (nextStep && !completed) {
            updates.push(`${fmtDate(nowIso)} · ${nextStep.title} started`);
          }
          if (completed) {
            updates.push(`${fmtDate(nowIso)} · Migration completed successfully`);
          }
          return [...updates, ...timeline];
        });
        return {
          ...prev,
          status: completed ? "completed" : prev.status,
          steps: nextSteps,
        };
      });
    }, 1700);
    return () => window.clearInterval(timer);
  }, [migrationJob]);

  const resetPageStateForMenuNavigation = (pageId) => {
    const firstSubpageId = PAGE_SUBPAGES[pageId]?.[0]?.id || "";
    setActiveSubpage(firstSubpageId);
    setSelectedSnapshotProtocol("");
    setSelectedSnapshotSource("");
    setSelectedSnapshotRestoreTarget("");
    setSnapshotOperationMode("clone");
    setSnapshotSearch("");
    setMigrationTargetServer("");
    setMigrationExecutionServer("");
    setMigrationServerMenuOpen(false);
    setMigrationExecutionMenuOpen(false);
    setMigrationAck(false);
    setMigrationJob(null);
    setMigrationTimeline([]);
    setMigrationSelectedChain("");
    setModalState((prev) => (prev.open ? { ...prev, open: false } : prev));
  };

  const handleMenuSelect = (pageId) => {
    resetPageStateForMenuNavigation(pageId);
    setPageRoute(pageId, globalScope);
    setMobileNavOpen(false);
  };

  const renderPage = () => {
    if (currentPage === "home") {
      const targetRows = effectiveUpdateTargetsState.payload?.items || [];
      const syncedTargets = targetRows.filter((item) => item.argocdSyncStatus === "Synced").length;
      const outOfSyncTargets = targetRows.filter((item) => item.argocdSyncStatus && item.argocdSyncStatus !== "Synced").length;
      const driftTargets = targetRows.filter((item) => item.imageMatch === false).length;
      const pendingImageChecks = targetRows.filter((item) => item.imageMatch == null).length;
      const degradedIdcs = statusItems.filter((item) => item.status !== "Healthy").length;
      const severityScore = { Critical: 4, High: 3, Medium: 2, Low: 1 };
      const unhealthyIdcs = statusItems.filter((item) => item.status !== "Healthy");
      const outOfSyncRows = targetRows.filter((item) => item.argocdSyncStatus && item.argocdSyncStatus !== "Synced");
      const imageDriftRows = targetRows.filter((item) => item.imageMatch === false);
      const openIncidentRows = alertsLogItems
        .filter((item) => item.state !== "Resolved")
        .sort((a, b) => (severityScore[b.severity] || 0) - (severityScore[a.severity] || 0));
      const topIncidents = [...alertsLogItems]
        .sort((a, b) => (severityScore[b.severity] || 0) - (severityScore[a.severity] || 0))
        .slice(0, 5);
      const nowStamp = new Date().toLocaleString();

      const openSreKpiModal = (kpi) => {
        if (kpi === "fleet-health") {
          openModal({
            title: "Fleet health drill-down",
            summary: `Unhealthy IDCs ${unhealthyIdcs.length} / ${statusItems.length}.`,
            bullets: unhealthyIdcs.length
              ? unhealthyIdcs.slice(0, 12).map((item) => `${item.idc.toUpperCase()} · ${item.region} · ${item.status} · Uptime ${item.uptime}`)
              : ["All IDCs are healthy right now."],
            footer: unhealthyIdcs.length > 12 ? `Showing 12 of ${unhealthyIdcs.length} unhealthy IDCs.` : "SRE focus: recover degraded IDCs before next rollout window.",
          });
          return;
        }

        if (kpi === "rollout-sync") {
          openModal({
            title: "Rollout sync drill-down",
            summary: `Out-of-sync targets ${outOfSyncRows.length} / ${targetRows.length || 0}.`,
            bullets: outOfSyncRows.length
              ? outOfSyncRows.slice(0, 12).map((item) => `${item.protocol} · ${item.network} · ${item.serverId} · Sync ${item.argocdSyncStatus || "pending"} · Health ${item.argocdHealthStatus || "unknown"}`)
              : ["All rollout targets are synced."],
            footer: outOfSyncRows.length > 12 ? `Showing 12 of ${outOfSyncRows.length} out-of-sync targets.` : "SRE focus: clear sync drift before migration execution.",
          });
          return;
        }

        if (kpi === "image-drift") {
          openModal({
            title: "Image drift drill-down",
            summary: `Image drift targets ${imageDriftRows.length}. Pending checks ${pendingImageChecks}.`,
            bullets: imageDriftRows.length
              ? imageDriftRows.slice(0, 12).map((item) => `${item.protocol} · ${item.network} · ${item.serverId} · Target ${item.targetVersion || "n/a"} · Live ${item.liveImage || "pending"}`)
              : ["No image drift targets detected."],
            footer: imageDriftRows.length > 12 ? `Showing 12 of ${imageDriftRows.length} drift targets.` : "SRE focus: close drift gaps to reduce rollback risk.",
          });
          return;
        }

        openModal({
          title: "Incident pressure drill-down",
          summary: `Open incidents ${openIncidentRows.length}. Critical ${criticalAlerts}.`,
          bullets: openIncidentRows.length
            ? openIncidentRows.slice(0, 12).map((item) => `${item.id.toLowerCase()} · ${item.severity} · ${item.state} · ${item.server} · ${item.title}`)
            : ["No open incidents right now."],
          footer: openIncidentRows.length > 12 ? `Showing 12 of ${openIncidentRows.length} open incidents.` : "SRE focus: contain high-severity alerts and reduce queue pressure.",
        });
      };

      return (
        <section className="panel homePanel sreHomePanel">
          <div className="panelHead panelHeadSplit">
            <div>
              <p className="panelInlineTitle">{currentPageMeta.title}</p>
              <p>SRE command center for incident pressure, rollout risk, and fleet reliability posture.</p>
            </div>
            <div className="inlineMetrics">
              <span className="metricPill">As of {nowStamp}</span>
              <span className="metricPill warn">Open incidents: {activeAlerts}</span>
              <span className="metricPill danger">Critical: {criticalAlerts}</span>
            </div>
          </div>

          <div className="sreKpiGrid">
            <article className="sreKpiCard">
              <button type="button" className="sreKpiButton" onClick={() => openSreKpiModal("fleet-health")}>
                <p className="summaryLabel">Fleet health</p>
                <p className="summaryValue">{healthyServices}/{statusItems.length} healthy</p>
                <p className="summaryMeta">Non-healthy IDCs: {degradedIdcs}</p>
              </button>
            </article>
            <article className="sreKpiCard">
              <button type="button" className="sreKpiButton" onClick={() => openSreKpiModal("rollout-sync")}>
                <p className="summaryLabel">Rollout sync</p>
                <p className="summaryValue">{syncedTargets}/{targetRows.length || 0} synced</p>
                <p className="summaryMeta">Out of sync targets: {outOfSyncTargets}</p>
              </button>
            </article>
            <article className="sreKpiCard">
              <button type="button" className="sreKpiButton" onClick={() => openSreKpiModal("image-drift")}>
                <p className="summaryLabel">Image drift</p>
                <p className="summaryValue">{driftTargets}</p>
                <p className="summaryMeta">Pending image checks: {pendingImageChecks}</p>
              </button>
            </article>
            <article className="sreKpiCard">
              <button type="button" className="sreKpiButton" onClick={() => openSreKpiModal("incident-pressure")}>
                <p className="summaryLabel">Incident pressure</p>
                <p className="summaryValue">{activeAlerts} open investigations</p>
                <p className="summaryMeta">Critical incidents: {criticalAlerts}</p>
              </button>
            </article>
          </div>

          <div className="sreLayout">
            <section className="sreSection sreSectionFull">
              <div className="sreSectionHead">
                <h3>Priority Incidents</h3>
                <button type="button" className="inlineActionButton" onClick={() => setPageRoute("alerts-log", globalScope)}>
                  Open Alerts Log
                </button>
              </div>
              <div className="sreIncidentList">
                {topIncidents.map((alert) => (
                  <article key={alert.id} className="sreIncidentRow">
                    <div>
                      <p className="widgetLabel priorityIncidentLabel">{alert.id.toLowerCase()} · {String(alert.title || "").toLowerCase()}</p>
                      <p className="widgetMeta">{alert.chain} · {alert.server} · Detected {alert.detectedAt}</p>
                    </div>
                    <div className="sreMetaPills">
                      <span className={`badge badge-${formatBadgeLabel(alert.severity)}`}>{String(alert.severity || "").toLowerCase()}</span>
                      <span className={`badge badge-${formatBadgeLabel(alert.state)}`}>{String(alert.state || "").toLowerCase()}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

          </div>
        </section>
      );
    }

    if (currentPage === "server-status") {
      return (
        <section className="panel statusPanel">
          <div className="panelHead panelHeadSplit">
            <div>
              <p className="panelInlineTitle">{currentPageMeta.title}</p>
              <p>IDC-level fleet overview with total server and chain coverage.</p>
            </div>
            <div className="inlineMetrics">
              <span className="metricPill">IDC healthy: {healthyServices}/{statusItems.length}</span>
              <span className="metricPill">Total chains: {totalChains}</span>
              <span className="metricPill">Filtered: {filteredStatusItems.length}</span>
              <span className="metricPill warn">Active alerts: {activeAlerts}</span>
              <span className="metricPill danger">Critical: {criticalAlerts}</span>
            </div>
          </div>
          {serverStatusState.error ? <p className="statusLine danger">{serverStatusState.error}</p> : null}
          <div className="statusFilters">
            <label>
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                {statusFilterOptions.map((value) => (
                  <option key={value} value={value}>{value === "all" ? "All" : value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Region</span>
              <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
                {regionFilterOptions.map((value) => (
                  <option key={value} value={value}>{value === "all" ? "All" : value}</option>
                ))}
              </select>
            </label>
            <label className="statusSearchField compactSearchField">
              <span>Server search</span>
              <input
                type="text"
                value={serverSearch}
                onChange={(event) => setServerSearch(event.target.value)}
                placeholder="Filter by server or region"
              />
            </label>
          </div>
          <div className="tableWrap">
            <table className="unifiedTable">
              <thead>
                <tr>
                  <th><SortHeaderButton label="Server" columnKey="idc" sortConfig={statusTableSort} onToggle={(key) => setStatusTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Status" columnKey="status" sortConfig={statusTableSort} onToggle={(key) => setStatusTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Region" columnKey="region" sortConfig={statusTableSort} onToggle={(key) => setStatusTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Uptime" columnKey="uptime" sortConfig={statusTableSort} onToggle={(key) => setStatusTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Chains" columnKey="chains" sortConfig={statusTableSort} onToggle={(key) => setStatusTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Servers" columnKey="servers" sortConfig={statusTableSort} onToggle={(key) => setStatusTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="CPU vCore" columnKey="totalCpuVcore" sortConfig={statusTableSort} onToggle={(key) => setStatusTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Memory (GiB)" columnKey="totalMemoryGb" sortConfig={statusTableSort} onToggle={(key) => setStatusTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Storage (TiB)" columnKey="totalStorageTb" sortConfig={statusTableSort} onToggle={(key) => setStatusTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {sortedStatusItems.length ? sortedStatusItems.map((item) => (
                  <tr
                    key={item.idc}
                    className="clickableRow"
                    onClick={() => setOpsDetailRoute("server", item.idc, globalScope)}
                  >
                    <td>
                      <span className="tablePlainText">{item.idc.toUpperCase()}</span>
                    </td>
                    <td><span className={`badge badge-${formatBadgeLabel(item.status)}`}>{item.status}</span></td>
                    <td>{item.region}</td>
                    <td>{item.uptime}</td>
                    <td>{item.chains}</td>
                    <td>{item.servers}</td>
                    <td>{item.totalCpuVcore}</td>
                    <td>{item.totalMemoryGb}</td>
                    <td>{item.totalStorageTb}</td>
                    <td>
                      <button
                        type="button"
                        className="inlineActionButton"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpsDetailRoute("server", item.idc, globalScope);
                        }}
                      >
                        Open detail
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={10}>No servers match the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    if (currentPage === "alerts-log") {
      return (
        <section className="panel alertsPanel">
          <div className="panelHead panelHeadSplit">
            <div>
              <p className="panelInlineTitle">{currentPageMeta.title}</p>
              <p>Incident stream with severity context, response state, and operator impact.</p>
            </div>
            <div className="inlineMetrics">
              <span className="metricPill">Total alerts: {alertsLogItems.length}</span>
              <span className="metricPill">Filtered: {sortedAlerts.length}</span>
              <span className="metricPill warn">Open incidents: {filteredOpenAlerts}</span>
              <span className="metricPill danger">Critical: {filteredCriticalAlerts}</span>
            </div>
          </div>
          <div className="alertsFilters">
            <label>
              <span>Date</span>
              <select value={alertDateFilter} onChange={(event) => setAlertDateFilter(event.target.value)}>
                {alertDateOptions.map((value) => (
                  <option key={value} value={value}>{value === "all" ? "All" : value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Server</span>
              <select value={alertServerFilter} onChange={(event) => setAlertServerFilter(event.target.value)}>
                {alertServerOptions.map((value) => (
                  <option key={value} value={value}>{value === "all" ? "All" : value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Chain</span>
              <select value={alertChainFilter} onChange={(event) => setAlertChainFilter(event.target.value)}>
                {alertChainOptions.map((value) => (
                  <option key={value} value={value}>{value === "all" ? "All" : value}</option>
                ))}
              </select>
            </label>
          </div>
              <div className="tableWrap alertsLogTableWrap">
                <table className="unifiedTable">
              <thead>
                <tr>
                  <th><SortHeaderButton label="Occurred At" columnKey="occurredAt" sortConfig={alertsTableSort} onToggle={(key) => setAlertsTableSort((prev) => nextSortConfig(prev, key, "desc"))} /></th>
                  <th><SortHeaderButton label="Title" columnKey="title" sortConfig={alertsTableSort} onToggle={(key) => setAlertsTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Chain" columnKey="chain" sortConfig={alertsTableSort} onToggle={(key) => setAlertsTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Server" columnKey="server" sortConfig={alertsTableSort} onToggle={(key) => setAlertsTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Severity" columnKey="severity" sortConfig={alertsTableSort} onToggle={(key) => setAlertsTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="State" columnKey="state" sortConfig={alertsTableSort} onToggle={(key) => setAlertsTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Impact" columnKey="impact" sortConfig={alertsTableSort} onToggle={(key) => setAlertsTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {sortedAlerts.length ? sortedAlerts.map((alert) => (
                  <tr
                    key={alert.id}
                    className="clickableRow"
                    onClick={() => setOpsDetailRoute("incident", alert.id.toLowerCase(), globalScope)}
                  >
                    <td>{alert.occurredAt || alert.occurredOn}</td>
                    <td>{alert.title}</td>
                    <td>{alert.chain}</td>
                    <td>{alert.server}</td>
                    <td><span className={`badge alertSeverityBadge badge-${formatBadgeLabel(alert.severity)}`}>{alert.severity}</span></td>
                    <td><span className={`badge alertStateBadge badge-${formatBadgeLabel(alert.state)}`}>{alert.state}</span></td>
                    <td>{alert.impact}</td>
                    <td>
                      <button
                        type="button"
                        className="inlineActionButton"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpsDetailRoute("incident", alert.id.toLowerCase(), globalScope);
                        }}
                      >
                        Open detail
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8}>No alerts match the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ActionButtons
            onAction={openModal}
            actions={[
              {
                label: "Responder handoff",
                title: "Responder handoff",
                summary: "Prepare handoff package for the next on-call rotation.",
                bullets: [
                  "Attach active incident IDs with current mitigation state.",
                  "Include known blast radius and customer impact notes.",
                  "Confirm owner and fallback contact for each high severity alert.",
                ],
              },
              {
                label: "Escalation matrix",
                title: "Escalation matrix",
                summary: "Escalation contacts based on severity and outage duration.",
                bullets: [
                  "Critical alerts: page primary responder immediately.",
                  "High alerts over 30 minutes: notify platform lead.",
                  "Include AI summary in every escalation payload.",
                ],
              },
            ]}
          />
        </section>
      );
    }

    if (currentPage === "alerts-reports") {
      return (
        <section className="panel reportPanel">
          <div className="panelHead">
            <p className="panelInlineTitle">{currentPageMeta.title}</p>
            <p>Response quality trend by reporting cycle.</p>
          </div>
          <div className="reportFilters">
            <label>
              <span>Type</span>
              <select value={reportTypeFilter} onChange={(event) => setReportTypeFilter(event.target.value)}>
                {reportTypeOptions.map((value) => (
                  <option key={value} value={value}>{value === "all" ? "All" : value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select value={reportStatusFilter} onChange={(event) => setReportStatusFilter(event.target.value)}>
                {reportStatusOptions.map((value) => (
                  <option key={value} value={value}>{value === "all" ? "All" : value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Date</span>
              <select value={reportDateFilter} onChange={(event) => setReportDateFilter(event.target.value)}>
                {reportDateOptions.map((value) => (
                  <option key={value} value={value}>{value === "all" ? "All" : value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="tableWrap">
            <table className="unifiedTable">
              <thead>
                <tr>
                  <th><SortHeaderButton label="Report ID" columnKey="id" sortConfig={reportsTableSort} onToggle={(key) => setReportsTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Type" columnKey="reportType" sortConfig={reportsTableSort} onToggle={(key) => setReportsTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Date" columnKey="reportedOn" sortConfig={reportsTableSort} onToggle={(key) => setReportsTableSort((prev) => nextSortConfig(prev, key, "desc"))} /></th>
                  <th><SortHeaderButton label="Incidents" columnKey="incidents" sortConfig={reportsTableSort} onToggle={(key) => setReportsTableSort((prev) => nextSortConfig(prev, key, "desc"))} /></th>
                  <th><SortHeaderButton label="Resolved SLA" columnKey="resolvedWithinSla" sortConfig={reportsTableSort} onToggle={(key) => setReportsTableSort((prev) => nextSortConfig(prev, key))} /></th>
                  <th><SortHeaderButton label="Status" columnKey="status" sortConfig={reportsTableSort} onToggle={(key) => setReportsTableSort((prev) => nextSortConfig(prev, key))} /></th>
                </tr>
              </thead>
              <tbody>
                {sortedAlertReports.length ? sortedAlertReports.map((report) => (
                  <tr
                    key={report.id}
                    className="clickableRow"
                    onClick={() => setOpsDetailRoute("report", report.id.toLowerCase(), globalScope)}
                  >
                    <td>{report.id}</td>
                    <td>{report.reportType}</td>
                    <td>{report.reportedOn}</td>
                    <td>{report.incidents}</td>
                    <td>{report.resolvedWithinSla}</td>
                    <td><span className={`badge badge-${formatBadgeLabel(report.status)}`}>{report.status}</span></td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6}>No reports match the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    if (currentPage === "chain-update") {
      return (
        <section className="panel reportPanel">
          <div className="panelHead">
            <p>Target update execution view with the same layout style as Alerts Reports.</p>
          </div>
          <UpdateTargetTable
            state={effectiveUpdateTargetsState}
            protocolSiteMap={protocolSiteMap}
            reportStyle
            onOpenTargetDetail={(targetKey) => setChainUpdateTargetRoute(targetKey, globalScope)}
          />
        </section>
      );
    }

    if (currentPage === "chain-migration") {
      return (
        <section className="panel workflowPanel chainMigrationPanel">
          <div className="panelHead">
            <p className="panelInlineTitle">{currentPageMeta.title}</p>
            <p>Select a target server and chain, then run a staged migration simulation.</p>
          </div>
          <>
            <div className="chainMigrationControlGrid singleColumn">
              <article className="widgetCard chainMigrationSelectCard">
                <p className="widgetLabel">1) Target server</p>
                <p className="widgetMeta">Choose the source server that currently has the chain data.</p>
                <div className="chainMigrationDropdown">
                  <button
                    type="button"
                    className="snapshotServerButton chainMigrationDropdownTrigger"
                    onClick={() => {
                      setMigrationServerMenuOpen((prev) => {
                        const next = !prev;
                        if (next) setMigrationExecutionMenuOpen(false);
                        return next;
                      });
                    }}
                  >
                    {migrationServer ? migrationServer.label : "Select target server"}
                  </button>
                  {migrationServerMenuOpen ? (
                    <div className="chainMigrationDropdownMenu">
                      {migrationServers.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`snapshotServerButton ${migrationTargetServer === item.id ? "active" : ""}`}
                          onClick={() => {
                            setMigrationTargetServer(item.id);
                            resetMigrationSelection();
                            setMigrationServerMenuOpen(false);
                          }}
                        >
                          {item.label} · {item.region}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {migrationSourceServer ? (
                  <p className="widgetMeta chainMigrationHint">
                    Source {migrationSourceServer.label} · Region {migrationSourceServer.region} · Status {migrationSourceServer.status}
                  </p>
                ) : null}
              </article>

              <article className="widgetCard chainMigrationSelectCard">
                <p className="widgetLabel">2) Migration server</p>
                <p className="widgetMeta">Choose destination server where the selected chain will be cloned and started.</p>
                <div className="chainMigrationDropdown">
                  <button
                    type="button"
                    className="snapshotServerButton chainMigrationDropdownTrigger"
                    onClick={() => {
                      setMigrationExecutionMenuOpen((prev) => {
                        const next = !prev;
                        if (next) setMigrationServerMenuOpen(false);
                        return next;
                      });
                    }}
                    disabled={!migrationExecutionOptions.length}
                  >
                    {migrationServer ? migrationServer.label : "Select migration server"}
                  </button>
                  {migrationExecutionMenuOpen ? (
                    <div className="chainMigrationDropdownMenu">
                      {migrationExecutionOptions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`snapshotServerButton ${migrationExecutionServer === item.id ? "active" : ""}`}
                          onClick={() => {
                            setMigrationExecutionServer(item.id);
                            setMigrationAck(false);
                            setMigrationExecutionMenuOpen(false);
                          }}
                        >
                          {item.label} · {item.region}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {migrationServer ? (
                  <p className="widgetMeta chainMigrationHint">
                    Destination {migrationServer.label} · Region {migrationServer.region} · Free {migrationServer.freeStorageTb.toFixed(1)} TiB
                  </p>
                ) : null}
              </article>
            </div>

              <div className="tableWrap chainMigrationTableWrap">
                <table className="unifiedTable">
                  <thead>
                    <tr>
                      <th><SortHeaderButton label="Chain" columnKey="protocol" sortConfig={migrationTableSort} onToggle={(key) => setMigrationTableSort((prev) => nextSortConfig(prev, key))} /></th>
                      <th><SortHeaderButton label="Source Server" columnKey="sourceServer" sortConfig={migrationTableSort} onToggle={(key) => setMigrationTableSort((prev) => nextSortConfig(prev, key))} /></th>
                      <th><SortHeaderButton label="Version" columnKey="version" sortConfig={migrationTableSort} onToggle={(key) => setMigrationTableSort((prev) => nextSortConfig(prev, key))} /></th>
                      <th><SortHeaderButton label="Required Storage" columnKey="requiredStorageTb" sortConfig={migrationTableSort} onToggle={(key) => setMigrationTableSort((prev) => nextSortConfig(prev, key, "desc"))} /></th>
                      <th><SortHeaderButton label="Sync Lag" columnKey="syncLagBlocks" sortConfig={migrationTableSort} onToggle={(key) => setMigrationTableSort((prev) => nextSortConfig(prev, key, "desc"))} /></th>
                      <th><SortHeaderButton label="ETA" columnKey="estimatedMinutes" sortConfig={migrationTableSort} onToggle={(key) => setMigrationTableSort((prev) => nextSortConfig(prev, key, "desc"))} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMigrationCandidateChains.length ? sortedMigrationCandidateChains.map((item) => (
                      <tr
                        key={item.id}
                        className={`clickableRow ${migrationSelectedChain === item.id ? "rowSelected" : ""}`}
                        onClick={() => {
                          setMigrationSelectedChain(item.id);
                          setMigrationAck(false);
                          setMigrationJob(null);
                          setMigrationTimeline([]);
                        }}
                      >
                        <td>
                          <div className="protocolCell">
                            <ProtocolLogo protocol={item.protocol} officialSite={item.officialSite || protocolSiteMap.get(item.protocol) || ""} />
                            <span>{item.protocol}</span>
                          </div>
                        </td>
                        <td>{String(item.sourceServer || "-").toUpperCase()}</td>
                        <td><span className="tag">{item.version}</span></td>
                        <td>{item.requiredStorageTb.toFixed(1)} TiB</td>
                        <td>{item.syncLagBlocks} blocks</td>
                        <td>{item.estimatedMinutes} min</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6}>No chains found on the selected server.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedMigrationChain ? (
                <section className="chainMigrationExecution">
                  <div className="panelHead panelHeadSplit">
                    <div>
                      <p className="panelInlineTitle">Execution Plan</p>
                      <p>
                        {selectedMigrationChain.protocol} from {migrationSourceServer?.label || String(selectedMigrationChain.sourceServer || "-").toUpperCase()} to {migrationServer?.label || "-"}
                      </p>
                    </div>
                    <span className={`badge badge-${formatBadgeLabel(migrationPrecheck?.riskLevel || "low")}`}>Risk {migrationPrecheck?.riskLevel || "Low"}</span>
                  </div>

                  <div className="chainMigrationPrecheckGrid">
                    {(migrationPrecheck?.checks || []).map((check) => (
                      <article key={check.id} className="snapshotMetaCard">
                        <p className="snapshotMetaLabel">{check.label}</p>
                        <p className="snapshotMetaValue">{check.detail}</p>
                        <span className={`badge badge-${check.pass ? "healthy" : "degraded"}`}>{check.pass ? "Pass" : "Fail"}</span>
                      </article>
                    ))}
                  </div>

                  <label className="chainMigrationAck">
                    <input
                      type="checkbox"
                      checked={migrationAck}
                      onChange={(event) => setMigrationAck(event.target.checked)}
                      disabled={!migrationPrecheck?.pass || (migrationJob && ["running", "paused"].includes(migrationJob.status))}
                    />
                    <span>I confirmed precheck and rollback point before execution.</span>
                  </label>

                  <div className="chainMigrationActionRow">
                    <button
                      type="button"
                      className="widgetActionButton"
                      onClick={startMigrationJob}
                      disabled={!migrationPrecheck?.pass || !migrationAck || (migrationJob && ["running", "paused"].includes(migrationJob.status))}
                    >
                      {migrationJob?.status === "completed" ? "Clone Again" : "Clone Chain"}
                    </button>
                    <button
                      type="button"
                      className="widgetActionButton ghost"
                      onClick={pauseMigrationJob}
                      disabled={!migrationJob || migrationJob.status !== "running"}
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      className="widgetActionButton ghost"
                      onClick={resumeMigrationJob}
                      disabled={!migrationJob || migrationJob.status !== "paused"}
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      className="widgetActionButton ghost"
                      onClick={rollbackMigrationJob}
                      disabled={!migrationJob || ["rolled_back", "completed"].includes(migrationJob.status)}
                    >
                      Rollback
                    </button>
                  </div>

                  {migrationJob ? (
                    <div className="chainMigrationStepList">
                      <p className="widgetMeta">
                        Job {migrationJob.id} · {migrationJob.mode === "cutover" ? "Clone + cutover" : "Clone"} ·
                        <span className={`badge badge-${formatBadgeLabel(migrationJob.status)}`}> {migrationJob.status}</span>
                      </p>
                      {migrationJob.steps.map((step) => (
                        <article key={step.id} className={`workflowCard chain-${migrationStepTone(step.status)}`}>
                          <p className="workflowLabel">{step.title}</p>
                          <p className="workflowDetail">{step.detail}</p>
                          <span className={`badge badge-${formatBadgeLabel(step.status)}`}>{step.status}</span>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  {migrationTimeline.length ? (
                    <div className="chainMigrationStepList">
                      <p className="widgetMeta">Recent timeline</p>
                      {migrationTimeline.slice(0, 6).map((line) => (
                        <p key={line} className="statusLine">{line}</p>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
        </section>
      );
    }

    if (currentPage === "chain-snapshot") {
      const capacityPool = ["15000Gi", "18000Gi", "22000Gi", "24000Gi", "32000Gi"];
      const snapshotRows = clients.map((item, index) => {
        const meta = metadata.get(item.protocol) || {};
        const token = item.protocol.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `chain-${index + 1}`;
        const namespace = `${token}-mainnet`;
        const client = /lighthouse/i.test(item.protocol) ? "lighthouse" : /arbitrum/i.test(item.protocol) ? "nitro" : "execution";
        const syncType = /archive/i.test(item.note || "") ? "archive" : "full";
        const basePvc = `${token}-${client}-${syncType}-base-pvc`;
        const sourcePvcs = [
          `idc-int-${token}-${client}-${syncType}-01-pvc`,
          `idc-int-${token}-${client}-${syncType}-02-pvc`,
        ];
        return {
          protocol: item.protocol,
          officialSite: item.officialSite || "",
          token,
          namespace,
          client,
          syncType,
          basePvc,
          sourcePvcs,
          snapshotCapacity: capacityPool[index % capacityPool.length],
          snapshotAt: meta.updatedAt || null,
          version: meta.version || "n/a",
        };
      });

      const selectedRow = snapshotRows.find((item) => item.protocol === selectedSnapshotProtocol) || null;
      const filteredSnapshotRows = snapshotRows.filter((item) => {
        const q = snapshotSearch.trim().toLowerCase();
        if (!q) return true;
        return item.protocol.toLowerCase().includes(q)
          || item.namespace.toLowerCase().includes(q)
          || item.client.toLowerCase().includes(q)
          || item.syncType.toLowerCase().includes(q)
          || String(item.version || "").toLowerCase().includes(q);
      });
      const sortedSnapshotRows = sortRowsByConfig(filteredSnapshotRows, snapshotTableSort, (row, key) => row?.[key] ?? "");
      const selectedSource = selectedSnapshotSource || selectedRow?.sourcePvcs?.[0] || "";
      const serverSuffix = (selectedSnapshotServer.match(/(\d+)$/)?.[1] || "01").padStart(2, "0");
      const restoreTargetPvcs = selectedRow
        ? [
          `${selectedRow.token}-${selectedRow.client}-${selectedRow.syncType}-srv-${serverSuffix}-pvc`,
          `${selectedRow.token}-${selectedRow.client}-${selectedRow.syncType}-archive-${serverSuffix}-pvc`,
        ]
        : [];
      const selectedRestoreTarget = selectedSnapshotRestoreTarget || restoreTargetPvcs[0] || "";

      return (
        <section className="panel workflowPanel snapshotOpsPanel">
          <div className="panelHead">
            <p className="panelInlineTitle">{currentPageMeta.title}</p>
            <p>체인 목록에서 대상을 선택하고 서버를 지정해 BASE PVC 복제를 준비합니다.</p>
          </div>
          {loading ? (
            <div className="loading">Loading chains...</div>
          ) : (
            <>
              {!selectedRow ? (
                <>
                  <div className="statusFilters snapshotListFilters chainUpdateSearchFilters">
                    <label>
                      <span>Search</span>
                      <input
                        type="text"
                        value={snapshotSearch}
                        onChange={(event) => setSnapshotSearch(event.target.value)}
                        placeholder="Search protocol, namespace, client, version"
                      />
                    </label>
                  </div>
                  {snapshotRows.length === 0 ? (
                    <div className="historyEmpty">No chains available.</div>
                  ) : (
                    <div className="tableWrap">
                      <table className="unifiedTable">
                        <thead>
                            <tr>
                            <th><SortHeaderButton label="Protocol" columnKey="protocol" sortConfig={snapshotTableSort} onToggle={(key) => setSnapshotTableSort((prev) => nextSortConfig(prev, key))} /></th>
                            <th><SortHeaderButton label="Capacity" columnKey="snapshotCapacity" sortConfig={snapshotTableSort} onToggle={(key) => setSnapshotTableSort((prev) => nextSortConfig(prev, key, "desc"))} /></th>
                            <th><SortHeaderButton label="Base PVC Created" columnKey="snapshotAt" sortConfig={snapshotTableSort} onToggle={(key) => setSnapshotTableSort((prev) => nextSortConfig(prev, key, "desc"))} /></th>
                            </tr>
                        </thead>
                        <tbody>
                          {sortedSnapshotRows.length ? sortedSnapshotRows.map((item) => (
                            <tr
                              key={item.protocol}
                              className="clickableRow"
                              onClick={() => {
                                setSelectedSnapshotProtocol(item.protocol);
                                setSelectedSnapshotSource(item.sourcePvcs[0] || "");
                                setSelectedSnapshotRestoreTarget("");
                              }}
                            >
                              <td>
                                <div className="protocolCell">
                                  <ProtocolLogo protocol={item.protocol} officialSite={item.officialSite || protocolSiteMap.get(item.protocol) || ""} />
                                  <span>{item.protocol}</span>
                                </div>
                              </td>
                              <td>{item.snapshotCapacity}</td>
                              <td>{fmtDate(item.snapshotAt)}</td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={3}>No chains match the search query.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <section className="snapshotDetailContent">
                    <div className="panelHead">
                      <button
                        type="button"
                        className="ghostButton"
                        onClick={() => {
                          setSelectedSnapshotProtocol("");
                          setSelectedSnapshotSource("");
                          setSelectedSnapshotRestoreTarget("");
                        }}
                      >
                        Back to chain list
                      </button>
                      <h3 className="protocolCell">
                        <ProtocolLogo protocol={selectedRow.protocol} officialSite={selectedRow.officialSite || protocolSiteMap.get(selectedRow.protocol) || ""} />
                        <span>{selectedRow.protocol}</span>
                      </h3>
                      <p>{selectedRow.namespace} · {selectedRow.client} / {selectedRow.syncType}</p>
                    </div>
                    <div className="snapshotMetaGrid">
                      <article className="snapshotMetaCard">
                        <p className="snapshotMetaLabel">BASE PVC</p>
                        <p className="snapshotMetaValue">{selectedRow.basePvc}</p>
                      </article>
                      <article className="snapshotMetaCard">
                        <p className="snapshotMetaLabel">Current Snapshot Capacity</p>
                        <p className="snapshotMetaValue">{selectedRow.snapshotCapacity}</p>
                      </article>
                      <article className="snapshotMetaCard">
                        <p className="snapshotMetaLabel">Snapshot Timestamp</p>
                        <p className="snapshotMetaValue">{fmtDate(selectedRow.snapshotAt)}</p>
                      </article>
                    </div>

                    <div className="snapshotSelectionBlock">
                      <h4>Operation</h4>
                      <div className="snapshotServerGrid">
                        <button
                          type="button"
                          className={`snapshotServerButton ${snapshotOperationMode === "clone" ? "active" : ""}`}
                          onClick={() => setSnapshotOperationMode("clone")}
                        >
                          Clone to BASE PVC
                        </button>
                        <button
                          type="button"
                          className={`snapshotServerButton ${snapshotOperationMode === "restore" ? "active" : ""}`}
                          onClick={() => setSnapshotOperationMode("restore")}
                        >
                          Restore from BASE PVC
                        </button>
                      </div>
                    </div>

                    <div className="snapshotSelectionBlock">
                      <h4>Target Server (4 nodes)</h4>
                      <div className="snapshotServerGrid">
                        {snapshotServerOptions.map((server) => (
                          <button
                            key={server}
                            type="button"
                            className={`snapshotServerButton ${selectedSnapshotServer === server ? "active" : ""}`}
                            onClick={() => {
                              setSelectedSnapshotServer(server);
                              setSelectedSnapshotRestoreTarget("");
                            }}
                          >
                            {server}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="snapshotSelectionBlock">
                      {snapshotOperationMode === "clone" ? (
                        <>
                          <h4>Source PVC</h4>
                          <select
                            className="snapshotSourceSelect"
                            value={selectedSource}
                            onChange={(event) => setSelectedSnapshotSource(event.target.value)}
                          >
                            {selectedRow.sourcePvcs.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <>
                          <h4>Restore Target PVC</h4>
                          <p className="widgetMeta">Source is fixed to BASE PVC: {selectedRow.basePvc}</p>
                          <select
                            className="snapshotSourceSelect"
                            value={selectedRestoreTarget}
                            onChange={(event) => setSelectedSnapshotRestoreTarget(event.target.value)}
                          >
                            {restoreTargetPvcs.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>

                    <div className="snapshotActionRow">
                      <button
                        type="button"
                        className="widgetActionButton"
                        onClick={() =>
                          openModal(snapshotOperationMode === "clone"
                            ? {
                              title: `${selectedRow.protocol} BASE PVC clone request`,
                              summary: "Backend 연동 전 프론트 시뮬레이션입니다. 실행 파라미터를 확인하세요.",
                              bullets: [
                                `Operation: clone to BASE PVC`,
                                `Namespace: ${selectedRow.namespace}`,
                                `Source PVC: ${selectedSource}`,
                                `Target BASE PVC: ${selectedRow.basePvc}`,
                                `Target Server: ${selectedSnapshotServer}`,
                              ],
                            }
                            : {
                              title: `${selectedRow.protocol} BASE PVC restore request`,
                              summary: "복구 시뮬레이션입니다. BASE PVC에서 선택 서버 PVC로 복사합니다.",
                              bullets: [
                                `Operation: restore from BASE PVC`,
                                `Namespace: ${selectedRow.namespace}`,
                                `Source BASE PVC: ${selectedRow.basePvc}`,
                                `Target Server: ${selectedSnapshotServer}`,
                                `Restore Target PVC: ${selectedRestoreTarget}`,
                              ],
                            })
                        }
                      >
                        {snapshotOperationMode === "clone" ? "Clone PVC" : "Restore PVC"}
                      </button>
                    </div>
                </section>
              )}
            </>
          )}
        </section>
      );
    }

    if (currentPage === "intelligence-alerts") {
      return (
        <section className="panel intelligencePanel">
          <div className="panelHead">
            <p className="panelInlineTitle">{currentPageMeta.title}</p>
            <p>Operator-focused RCA candidates and preventative guidance from recent alerts.</p>
          </div>
          <PageSubnav items={availableSubpages} activeId={activeSubpageId} onChange={setActiveSubpage} />
          {activeSubpageId === "rca-feed" ? (
            <>
              <div className="insightGrid">
                {intelligenceIncidentItems.map((item) => (
                  <article key={item.title} className="insightCard">
                    <p className="workflowLabel">{item.title}</p>
                    <p className="insightSummary">{item.summary}</p>
                    <p className="insightAction"><strong>Recommended action:</strong> {item.action}</p>
                    <span className={`badge badge-${formatBadgeLabel(item.confidence)}`}>Confidence: {item.confidence}</span>
                    <button
                      type="button"
                      className="inlineActionButton"
                      onClick={() =>
                        openModal({
                          title: `${item.title} detail`,
                          summary: `Model confidence is ${item.confidence.toLowerCase()}.`,
                          bullets: [item.summary, item.action, "Track this item for the next 24h monitoring window."],
                        })
                      }
                    >
                      Open RCA detail
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="widgetGrid">
              {[
                { playbook: "Peer rebalance", scope: "Execution lag", eta: "20 min" },
                { playbook: "Queue smoothing", scope: "Indexer backlog", eta: "15 min" },
                { playbook: "Restore rehearsal", scope: "Snapshot readiness", eta: "30 min" },
              ].map((playbook) => (
                <article key={playbook.playbook} className="widgetCard">
                  <p className="widgetLabel">{playbook.playbook}</p>
                  <p className="widgetValue">Scope {playbook.scope}</p>
                  <p className="widgetMeta">Suggested runtime: {playbook.eta}</p>
                  <button
                    type="button"
                    className="widgetActionButton"
                    onClick={() =>
                      openModal({
                        title: `${playbook.playbook} playbook`,
                        summary: `Recommended for ${playbook.scope.toLowerCase()} incidents.`,
                        bullets: [
                          "Start with baseline telemetry capture.",
                          "Apply mitigation and verify p95 latency and error rate.",
                          "Record outcome in incident prevention log.",
                        ],
                      })
                    }
                  >
                    Open playbook
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      );
    }

    if (currentPage === "intelligence-reports") {
      return (
        <section className="panel intelligencePanel">
          <div className="panelHead">
            <p className="panelInlineTitle">{currentPageMeta.title}</p>
            <p>Frontend preview of daily, weekly, and monthly risk summaries for operators.</p>
          </div>
          <PageSubnav items={availableSubpages} activeId={activeSubpageId} onChange={setActiveSubpage} />
          {activeSubpageId === "trend-overview" ? (
            <div className="insightGrid">
              {intelligenceReportCards.map((item) => (
                <article key={item.period} className="insightCard">
                  <p className="workflowLabel">{item.period}</p>
                  <p className="insightSummary">{item.headline}</p>
                  <p className="insightAction">{item.detail}</p>
                  <button
                    type="button"
                    className="inlineActionButton"
                    onClick={() =>
                      openModal({
                        title: `${item.period} trend summary`,
                        summary: item.headline,
                        bullets: [item.detail, "Trend confidence updates after each report refresh."],
                      })
                    }
                  >
                    Open report context
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="widgetGrid">
              {[
                { signal: "Storage pressure", score: "High", window: "30d" },
                { signal: "RPC throttling", score: "Medium", window: "14d" },
                { signal: "Peer routing drift", score: "High", window: "7d" },
              ].map((item) => (
                <article key={item.signal} className="widgetCard">
                  <p className="widgetLabel">{item.signal}</p>
                  <p className="widgetValue">Risk {item.score}</p>
                  <p className="widgetMeta">Observation window: {item.window}</p>
                  <button
                    type="button"
                    className="widgetActionButton"
                    onClick={() =>
                      openModal({
                        title: `${item.signal} watch detail`,
                        summary: `${item.score} watch signal over ${item.window}.`,
                        bullets: [
                          "Track trend direction against previous period baseline.",
                          "Add prevention recommendation to next weekly report.",
                          "Escalate if risk remains high for two cycles.",
                        ],
                      })
                    }
                  >
                    View watch item
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      );
    }

    return (
      <section className="panel catalog">
        <div className="panelHead panelHeadSplit">
          <div>
            <p className="panelInlineTitle">{currentPageMeta.title}</p>
            <p>Client Catalog sorted by latest update from list and snapshot sources.</p>
          </div>
          <p>{snapshotGeneratedAt ? `Snapshot refreshed ${fmtDate(snapshotGeneratedAt)}` : "Snapshot metadata unavailable"}</p>
        </div>
        {availableSubpages.length > 1 ? (
          <PageSubnav items={availableSubpages} activeId={activeSubpageId} onChange={setActiveSubpage} />
        ) : null}
        {error ? <p className="statusLine danger">{error}</p> : null}
        {activeSubpageId === "catalog-view" ? (
          loading ? (
            <div className="loading">Loading protocols...</div>
          ) : (
            <ProtocolTable items={clients} metadata={metadata} onOpenDetail={setProtocolRoute} />
          )
        ) : (
          <div className="widgetGrid">
            {(clients.slice(0, 4).length > 0 ? clients.slice(0, 4) : [{ protocol: "No protocols loaded", id: "empty" }]).map((item) => {
              const meta = metadata.get(item.protocol) || {};
              return (
                <article key={item.id || item.protocol} className="widgetCard">
                  <p className="widgetLabel">{item.protocol}</p>
                  <p className="widgetValue">Version {meta.version || "n/a"}</p>
                  <p className="widgetMeta">Updated {fmtDate(meta.updatedAt)}</p>
                  <div className="widgetActionStack">
                    <button
                      type="button"
                      className="widgetActionButton"
                      onClick={() =>
                        openModal({
                          title: `${item.protocol} release brief`,
                          summary: "Protocol release snapshot from catalog metadata.",
                          bullets: [
                            `Version: ${meta.version || "n/a"}`,
                            `Updated date: ${fmtDate(meta.updatedAt)}`,
                            "Use protocol detail route for full review history.",
                          ],
                        })
                      }
                    >
                      Open brief
                    </button>
                    <button
                      type="button"
                      className="widgetActionButton ghost"
                      onClick={() => item.protocol && setProtocolRoute(item.protocol, globalScope)}
                      disabled={!item.protocol || item.protocol === "No protocols loaded"}
                    >
                      Open detail route
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="page">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="hero shell heroMinimal">
        <div className="heroTopline heroToplineHeader">
          <h1>Hyperpulse</h1>
          <button
            type="button"
            className="themeToggleButton"
            aria-pressed={theme === "dark"}
            onClick={() => {
              const nextTheme = theme === "dark" ? "light" : "dark";
              setTheme(nextTheme);
              setFollowSystemTheme(false);
            }}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="themeToggleGlyphs" aria-hidden="true">
              <span className="themeToggleIcon themeToggleIconSun">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2.5v2.6M12 18.9v2.6M4.7 4.7l1.8 1.8M17.5 17.5l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.7 19.3l1.8-1.8M17.5 6.5l1.8-1.8" />
                </svg>
              </span>
              <span className="themeToggleIcon themeToggleIconMoon">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M20 14.2a7.8 7.8 0 1 1-10.2-10 8.6 8.6 0 1 0 10.2 10z" />
                </svg>
              </span>
            </span>
          </button>
        </div>
        <p className="heroSub">Hyperpulse enables AI-powered server management and maintenance.</p>
      </header>

      <main className="shell">
        {route.type === "protocol-detail" ? (
          <ReviewDetail protocol={route.protocol} onBack={() => setPageRoute("chain-update-info", globalScope)} />
        ) : route.type === "chain-update-target-detail" ? (
          <ChainUpdateTargetDetail
            target={effectiveUpdateTargetsState.payload?.items?.find((item) => buildUpdateTargetKey(item) === route.targetKey) || null}
            allTargets={effectiveUpdateTargetsState.payload?.items || []}
            scope={globalScope}
            onBack={() => setPageRoute("chain-update", globalScope)}
            onRunUpdate={runUpdateForTarget}
          />
        ) : route.type === "ops-detail" ? (
          <OpsDetailPage
            entity={route.entity}
            entityId={route.entityId}
            scope={globalScope}
            onBack={() => setPageRoute("home", globalScope)}
            onOpenModal={openModal}
            statusItems={statusItems}
            alertItems={alertsLogItems}
            reportItems={alertReportRecords}
          />
        ) : (
          <div className={`workspace ${sidebarOpen ? "" : "sidebarClosed"} ${mobileNavOpen ? "mobileNavOpen" : ""}`}>
            <button
              type="button"
              className="mobileNavTrigger"
              aria-label="Open operations menu"
              aria-expanded={mobileNavOpen}
              aria-controls="primary-ops-navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              Menu
            </button>

            <button
              type="button"
              className="mobileNavBackdrop"
              aria-label="Close navigation menu"
              onClick={() => setMobileNavOpen(false)}
            />

            <div className="workspaceRail">
              <aside className={`sideNav ${sidebarOpen ? "" : "collapsed"}`}>
                <div className="sideNavHead">
                  <p className="sideNavLabel">Operations Menu</p>
                  <div className="sideNavHeadActions">
                    <button
                      type="button"
                      className="drawerDismiss"
                      onClick={() => setMobileNavOpen(false)}
                      aria-label="Close navigation menu"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      className="sideNavToggle"
                      aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                      aria-expanded={sidebarOpen}
                      onClick={() => setSidebarOpen((prev) => !prev)}
                    >
                      {sidebarOpen ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <nav id="primary-ops-navigation" className="sideNavItems" aria-label="Operations sections">
                  {["Overview", "Observability", "Change", "Intelligence"].map((plane) => (
                    <section key={plane} className="menuGroup">
                      <p className="menuGroupLabel">{plane} Plane</p>
                      <div className="menuGroupItems">
                        {HOME_PAGES.filter((item) => item.plane === plane).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`sideNavItem ${currentPage === item.id ? "active" : ""}`}
                            onClick={() => handleMenuSelect(item.id)}
                          >
                            <span className="sideNavTitle">{item.title}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </nav>
              </aside>
            </div>

            <section className="contentPane" aria-live="polite">
              {renderPage()}
            </section>
          </div>
        )}
      </main>
      <OperationsModal modalState={modalState} onClose={closeModal} />
    </div>
  );
}
