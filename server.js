const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");
const { spawn } = require("child_process");
require("dotenv").config();
const Fastify = require("fastify");
const helmet = require("@fastify/helmet");
const rateLimit = require("@fastify/rate-limit");
const { DatabaseSync } = require("node:sqlite");
const appwriteSdk = require("node-appwrite");
const { createWeekWindowService } = require("./server/weekWindowService");
const { createAnalyticsService } = require("./server/analyticsService");
const { createAppwriteSyncService } = require("./server/appwriteSyncService");
const { registerAllRoutes } = require("./server/routes");
const { buildConfig } = require("./server/config");

const config = buildConfig(process.env);
const {
  NODE_ENV,
  PORT,
  AUTO_SCRAPE_ENABLED,
  RETENTION_DAYS,
  AUTO_VACUUM_ENABLED,
  VACUUM_MIN_HOURS,
  PYTHON_CMD,
  APPWRITE_SYNC_ENABLED,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
  APPWRITE_DATABASE_ID,
  APPWRITE_SNAPSHOTS_COLLECTION_ID,
  APPWRITE_ENTRIES_COLLECTION_ID,
  APPWRITE_SYNC_INTERVAL_MINUTES,
  APPWRITE_SYNC_HOURLY_ALIGNED,
  APPWRITE_SYNC_TARGET_MINUTE,
  APPWRITE_SYNC_ENTRY_BATCH_SIZE,
  APPWRITE_SYNC_STARTUP_MIN_STALE_MINUTES,
  APPWRITE_BACKFILL_ENABLED,
  APPWRITE_BACKFILL_TARGET_MINUTE,
  APPWRITE_FUNCTION_ID,
  TRUSTED_LOCAL_ORIGINS,
  WRITE_API_TOKEN,
  AUTO_SCRAPE_EFFECTIVE,
  API_CACHE_MAX_ENTRIES,
} = config;

const HOST = "127.0.0.1";
const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, "dist");
const DB_PATH = path.join(ROOT, "data", "vox.db");
const IS_PROD = NODE_ENV === "production";
const HAS_DIST = fs.existsSync(DIST_DIR);
const SCRAPE_ARGS = [
  "scraper/scrape_gw2mists.py",
  "--pages",
  "3",
  "--per-page",
  "100",
  "--region",
  "eu",
  "--no-json",
];
const GW2MISTS_API_BASE = "https://api.gw2mists.com";
const GW2MISTS_PLAYER_V4_ENDPOINT = `${GW2MISTS_API_BASE}/leaderboard/player/v4`;
const GW2MISTS_SITE_URL = "https://gw2mists.com/leaderboards/player?nr=1&c=100";
const GUILD_SEARCH_JOB_TTL_MS = 60 * 60 * 1000;
const GUILD_SEARCH_MAX_JOBS = 20;
const GUILD_SEARCH_MAX_PAGES = 100;
const GUILD_SEARCH_MAX_PER_PAGE = 100;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const fastify = Fastify({
  logger: true,
  trustProxy: false,
  requestTimeout: 15000,
  bodyLimit: 1_000_000,
});

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL,
    region TEXT NOT NULL,
    pages INTEGER NOT NULL,
    per_page INTEGER NOT NULL,
    total_available INTEGER NOT NULL,
    count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS snapshot_entries (
    snapshot_id TEXT NOT NULL,
    rank INTEGER NOT NULL,
    account_name TEXT NOT NULL,
    weekly_kills INTEGER NOT NULL,
    total_kills INTEGER NOT NULL,
    wvw_guild_name TEXT,
    wvw_guild_tag TEXT,
    alliance_guild_name TEXT,
    alliance_guild_tag TEXT,
    PRIMARY KEY (snapshot_id, rank)
  );
  CREATE INDEX IF NOT EXISTS idx_snapshot_entries_account_name
  ON snapshot_entries(account_name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_snapshots_created_at
  ON snapshots(created_at);
  CREATE INDEX IF NOT EXISTS idx_snapshot_entries_account_snapshot
  ON snapshot_entries(account_name COLLATE NOCASE, snapshot_id);
`);

const snapshotEntryColumns = new Set(
  db.prepare("PRAGMA table_info(snapshot_entries)").all().map((row) => String(row.name || "").toLowerCase())
);
if (!snapshotEntryColumns.has("wvw_guild_name")) db.exec("ALTER TABLE snapshot_entries ADD COLUMN wvw_guild_name TEXT");
if (!snapshotEntryColumns.has("wvw_guild_tag")) db.exec("ALTER TABLE snapshot_entries ADD COLUMN wvw_guild_tag TEXT");
if (!snapshotEntryColumns.has("alliance_guild_name")) db.exec("ALTER TABLE snapshot_entries ADD COLUMN alliance_guild_name TEXT");
if (!snapshotEntryColumns.has("alliance_guild_tag")) db.exec("ALTER TABLE snapshot_entries ADD COLUMN alliance_guild_tag TEXT");
if (snapshotEntryColumns.has("guild_name")) {
  db.exec("UPDATE snapshot_entries SET alliance_guild_name = COALESCE(alliance_guild_name, guild_name)");
}
if (snapshotEntryColumns.has("guild_tag")) {
  db.exec("UPDATE snapshot_entries SET alliance_guild_tag = COALESCE(alliance_guild_tag, guild_tag)");
}
if (snapshotEntryColumns.has("alliance_name")) {
  db.exec("UPDATE snapshot_entries SET wvw_guild_name = COALESCE(wvw_guild_name, alliance_name)");
}
if (snapshotEntryColumns.has("alliance_tag")) {
  db.exec("UPDATE snapshot_entries SET wvw_guild_tag = COALESCE(wvw_guild_tag, alliance_tag)");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_snapshot_entries_wvw_guild_tag ON snapshot_entries(wvw_guild_tag COLLATE NOCASE)");
db.exec("CREATE INDEX IF NOT EXISTS idx_snapshot_entries_alliance_guild_tag ON snapshot_entries(alliance_guild_tag COLLATE NOCASE)");

const qSnapshots = db.prepare(`
  SELECT snapshot_id, created_at, region, count
  FROM snapshots
  WHERE EXISTS (
    SELECT 1
    FROM snapshot_entries e
    WHERE e.snapshot_id = snapshots.snapshot_id
  )
  ORDER BY created_at DESC
`);

const qLatestSnapshot = db.prepare(`
  SELECT snapshot_id, created_at, region, count
  FROM snapshots
  WHERE EXISTS (
    SELECT 1
    FROM snapshot_entries e
    WHERE e.snapshot_id = snapshots.snapshot_id
  )
  ORDER BY created_at DESC
  LIMIT 1
`);

const qLatestEntries = db.prepare(`
  SELECT rank, account_name, weekly_kills, total_kills, wvw_guild_name, wvw_guild_tag, alliance_guild_name, alliance_guild_tag
  FROM snapshot_entries
  WHERE snapshot_id = ?
  ORDER BY rank ASC
  LIMIT ?
`);

const qSnapshotExists = db.prepare(`
  SELECT 1 AS ok
  FROM snapshots
  WHERE snapshot_id = ?
  LIMIT 1
`);

const qUpsertSnapshot = db.prepare(`
  INSERT OR REPLACE INTO snapshots
  (snapshot_id, created_at, source, region, pages, per_page, total_available, count)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const qDeleteSnapshotEntries = db.prepare(`
  DELETE FROM snapshot_entries
  WHERE snapshot_id = ?
`);

const qInsertSnapshotEntry = db.prepare(`
  INSERT INTO snapshot_entries
  (snapshot_id, rank, account_name, weekly_kills, total_kills, wvw_guild_name, wvw_guild_tag, alliance_guild_name, alliance_guild_tag)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const qHistory = db.prepare(`
  SELECT
    s.snapshot_id AS snapshotId,
    s.created_at AS createdAt,
    e.rank AS rank,
    e.weekly_kills AS weeklyKills,
    e.total_kills AS totalKills,
    e.account_name AS accountName,
    e.wvw_guild_name AS wvwGuildName,
    e.wvw_guild_tag AS wvwGuildTag,
    e.alliance_guild_name AS allianceGuildName,
    e.alliance_guild_tag AS allianceGuildTag
  FROM snapshot_entries e
  JOIN snapshots s ON s.snapshot_id = e.snapshot_id
  WHERE e.account_name = ? COLLATE NOCASE
  ORDER BY s.created_at ASC
`);

const qAccountSearch = db.prepare(`
  SELECT account_name, MIN(rank) AS best_rank
  FROM snapshot_entries
  WHERE account_name LIKE ? COLLATE NOCASE
  GROUP BY account_name
  ORDER BY best_rank ASC, account_name ASC
  LIMIT ?
`);

const apiCache = new Map();
const apiInFlight = new Map();

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function makeCacheKey(namespace, params = {}) {
  return `${namespace}:${stableStringify(params)}`;
}

function clearApiCache() {
  apiCache.clear();
  apiInFlight.clear();
  fastify.log.info("[cache] Cleared after snapshot refresh.");
}

function resolveApiCacheTtlMs(namespace, ttlMs) {
  if (!APPWRITE_SYNC_ENABLED) return ttlMs;
  if (namespace === "health" || namespace === "snapshot-status") return Math.min(ttlMs, 15_000);
  // In Appwrite-sync mode, new data lands hourly. Keep reads warm between sync cycles.
  return Math.max(ttlMs, 10 * 60 * 1000);
}

function pruneApiCacheIfNeeded(nowMs) {
  if (apiCache.size <= API_CACHE_MAX_ENTRIES) return;
  for (const [key, entry] of apiCache) {
    if (!entry || entry.expiresAt <= nowMs) apiCache.delete(key);
  }
  if (apiCache.size <= API_CACHE_MAX_ENTRIES) return;
  const target = Math.floor(API_CACHE_MAX_ENTRIES * 0.9);
  const removeCount = Math.max(1, apiCache.size - target);
  let removed = 0;
  for (const key of apiCache.keys()) {
    apiCache.delete(key);
    removed += 1;
    if (removed >= removeCount) break;
  }
}

async function withApiCache(namespace, params, ttlMs, computeFn) {
  const effectiveTtlMs = resolveApiCacheTtlMs(namespace, ttlMs);
  const key = makeCacheKey(namespace, params);
  const now = Date.now();
  const hit = apiCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  if (apiInFlight.has(key)) return apiInFlight.get(key);

  const p = Promise.resolve()
    .then(computeFn)
    .then((value) => {
      const storedAt = Date.now();
      apiCache.set(key, { value, expiresAt: storedAt + effectiveTtlMs });
      pruneApiCacheIfNeeded(storedAt);
      apiInFlight.delete(key);
      return value;
    })
    .catch((err) => {
      apiInFlight.delete(key);
      throw err;
    });

  apiInFlight.set(key, p);
  return p;
}

const {
  getCurrentWeekWindowBrussels,
  normalizeWeekEndParam,
  listSelectableWeekWindows,
  resolveWeekWindowForRequest,
  resolveWeekSelectionOrReply,
  millisecondsToNextAutoScrape,
} = createWeekWindowService(db);

function getLatestSnapshotMeta() {
  const snap = qLatestSnapshot.get();
  if (!snap || !snap.snapshot_id) return null;
  return {
    snapshotId: snap.snapshot_id,
    createdAt: snap.created_at,
    region: snap.region,
    count: snap.count,
  };
}

const analyticsService = createAnalyticsService({
  db,
  getLatestSnapshotMeta,
  getCurrentWeekWindowBrussels,
});

function getLatestSnapshotMetaInWindow(startUtc, endUtc) {
  return analyticsService.getLatestSnapshotMetaInWindow(startUtc, endUtc);
}

function getTopProgression(top, scope = "week", days = null, weekWindow = null) {
  return analyticsService.getTopProgression(top, scope, days, weekWindow);
}

function sanitizeAccountName(value) {
  const v = String(value || "").trim();
  if (!v || v.length > 80) return "";
  return v;
}

function normalizeOptionalText(value, maxLen = 120) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return v.slice(0, maxLen);
}

function serializeEntryRow(row) {
  return {
    rank: row.rank,
    accountName: row.account_name,
    weeklyKills: row.weekly_kills,
    totalKills: row.total_kills,
    wvwGuildName: row.wvw_guild_name ?? null,
    wvwGuildTag: row.wvw_guild_tag ?? null,
    allianceGuildName: row.alliance_guild_name ?? null,
    allianceGuildTag: row.alliance_guild_tag ?? null,
  };
}

function parseAccountsParam(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const cleaned = raw
    .split(",")
    .map((s) => sanitizeAccountName(s))
    .filter(Boolean)
    .slice(0, 10);
  return [...new Map(cleaned.map((v) => [v.toLowerCase(), v])).values()];
}

function isValidDiscordWebhookUrl(url) {
  return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/[^/\s]+\/[^/\s]+/i.test(
    String(url || "").trim()
  );
}

function maskDiscordWebhookUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    const token = parts[parts.length - 1] || "";
    const tokenSuffix = token ? token.slice(-6) : "unknown";
    return `${u.origin}/api/webhooks/***${tokenSuffix}`;
  } catch {
    return "invalid_webhook_url";
  }
}

function chunkArray(items, chunkSize) {
  const out = [];
  if (!Array.isArray(items) || !items.length || chunkSize <= 0) return out;
  for (let i = 0; i < items.length; i += chunkSize) out.push(items.slice(i, i + chunkSize));
  return out;
}

function getCompareSeries(accounts, scope, hasDaysFilter, cutoffIso, weekWindow) {
  return analyticsService.getCompareSeries(accounts, scope, hasDaysFilter, cutoffIso, weekWindow);
}

async function warmApiCacheAfterDataChange(reason) {
  cacheWarmStatus.running = true;
  cacheWarmStatus.lastReason = reason;
  cacheWarmStatus.lastStartedAt = new Date().toISOString();
  cacheWarmStatus.lastError = null;
  try {
    const top = 100;
    const scope = "week";
    await Promise.all([
      withApiCache("snapshots", {}, 45_000, async () => ({
        snapshots: qSnapshots.all().map((row) => ({
          snapshotId: row.snapshot_id,
          createdAt: row.created_at,
          region: row.region,
          count: row.count,
        })),
      })),
      withApiCache("latest", { top }, 45_000, async () => {
        const snap = qLatestSnapshot.get();
        if (!snap || !snap.snapshot_id) return { snapshot: null, entries: [] };
        return {
          snapshot: {
            snapshotId: snap.snapshot_id,
            createdAt: snap.created_at,
            region: snap.region,
            count: snap.count,
          },
          entries: qLatestEntries.all(snap.snapshot_id, top).map((row) => serializeEntryRow(row)),
        };
      }),
      withApiCache("progression", { top: 10, scope, days: null }, 60_000, async () =>
        getTopProgression(10, scope)
      ),
      withApiCache("delta", { top: 30, metric: "weeklyKills", scope }, 60_000, async () =>
        getDeltaLeaderboard({ top: 30, metric: "weeklyKills", scope })
      ),
      withApiCache("anomalies", { top: 20, minDeltaAbs: 80, lookbackHours: 72, scope }, 60_000, async () =>
        getAnomalies({ top: 20, minDeltaAbs: 80, lookbackHours: 72, scope })
      ),
      withApiCache("weekly-report", {}, 60_000, async () => {
        const delta = getDeltaLeaderboard({ top: 30, metric: "weeklyKills", scope });
        const anomalies = getAnomalies({ top: 15, minDeltaAbs: 80, lookbackHours: 72, scope });
        const progression = getTopProgression(10, scope);
        const latest = await withApiCache("latest", { top: 100 }, 45_000, async () => {
          const snap = qLatestSnapshot.get();
          if (!snap || !snap.snapshot_id) return { snapshot: null, entries: [] };
          return {
            snapshot: {
              snapshotId: snap.snapshot_id,
              createdAt: snap.created_at,
              region: snap.region,
              count: snap.count,
            },
            entries: qLatestEntries.all(snap.snapshot_id, 100).map((row) => serializeEntryRow(row)),
          };
        });
        return { generatedAt: new Date().toISOString(), latest, delta, anomalies, progression };
      }),
    ]);
    fastify.log.info(`[cache] Warmed core API cache after ${reason}.`);
  } catch (err) {
    cacheWarmStatus.lastError = err.message;
    fastify.log.warn(`[cache] Warmup skipped after ${reason}: ${err.message}`);
  } finally {
    cacheWarmStatus.running = false;
    cacheWarmStatus.lastFinishedAt = new Date().toISOString();
  }
}

function importSnapshotIntoLocalDb(snapshot, entries) {
  // Some upstream snapshots may contain duplicated ranks; local PK is (snapshot_id, rank).
  const dedupedEntries = [];
  const seenRanks = new Set();
  for (const entry of entries) {
    const rank = Math.max(1, Math.floor(Number(entry?.rank || 0)));
    if (!rank || seenRanks.has(rank)) continue;
    seenRanks.add(rank);
    dedupedEntries.push({ ...entry, rank });
  }

  db.exec("BEGIN");
  try {
    qUpsertSnapshot.run(
      snapshot.snapshotId,
      snapshot.createdAt,
      snapshot.source,
      snapshot.region,
      Math.max(1, Math.floor(snapshot.pages)),
      Math.max(1, Math.floor(snapshot.perPage)),
      Math.max(0, Math.floor(snapshot.totalAvailable)),
      Math.max(0, Math.floor(snapshot.count || dedupedEntries.length))
    );
    qDeleteSnapshotEntries.run(snapshot.snapshotId);
    for (const entry of dedupedEntries) {
      qInsertSnapshotEntry.run(
        snapshot.snapshotId,
        entry.rank,
        entry.accountName,
        Math.max(0, Math.floor(entry.weeklyKills)),
        Math.max(0, Math.floor(entry.totalKills)),
        normalizeOptionalText(entry.wvwGuildName),
        normalizeOptionalText(entry.wvwGuildTag),
        normalizeOptionalText(entry.allianceGuildName),
        normalizeOptionalText(entry.allianceGuildTag)
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const appwriteSyncService = createAppwriteSyncService({
  appwriteSdk,
  config: {
    enabled: APPWRITE_SYNC_ENABLED,
    endpoint: APPWRITE_ENDPOINT,
    projectId: APPWRITE_PROJECT_ID,
    apiKey: APPWRITE_API_KEY,
    databaseId: APPWRITE_DATABASE_ID,
    snapshotsCollectionId: APPWRITE_SNAPSHOTS_COLLECTION_ID,
    entriesCollectionId: APPWRITE_ENTRIES_COLLECTION_ID,
    syncIntervalMinutes: APPWRITE_SYNC_INTERVAL_MINUTES,
    syncHourlyAligned: APPWRITE_SYNC_HOURLY_ALIGNED,
    syncTargetMinute: APPWRITE_SYNC_TARGET_MINUTE,
    syncEntryBatchSize: APPWRITE_SYNC_ENTRY_BATCH_SIZE,
    syncStartupMinStaleMinutes: APPWRITE_SYNC_STARTUP_MIN_STALE_MINUTES,
    backfillEnabled: APPWRITE_BACKFILL_ENABLED,
    backfillTargetMinute: APPWRITE_BACKFILL_TARGET_MINUTE,
    functionId: APPWRITE_FUNCTION_ID,
  },
  deps: {
    qLatestSnapshot,
    qSnapshotExists,
    importSnapshotIntoLocalDb,
    sanitizeAccountName,
    normalizeOptionalText,
    chunkArray,
    log: fastify.log,
    onImported: () => {
      clearApiCache();
      warmApiCacheAfterDataChange("appwrite-sync").catch(() => { });
      runMaintenance("post-appwrite-sync").catch(() => { });
    },
  },
});


let scrapeInProgress = false;
let scrapeTimer = null;
let nextHourlyAtIso = null;
let maintenanceInProgress = false;
const processStartedAtIso = new Date().toISOString();
const snapshotStatus = {
  running: false,
  lastTrigger: null,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastExitCode: null,
  lastError: null,
};
const maintenanceStatus = {
  running: false,
  lastRunAt: null,
  lastRunReason: null,
  lastRetentionDeletedSnapshots: 0,
  lastRetentionDeletedEntries: 0,
  lastVacuumAt: null,
  lastError: null,
};
const appwriteSyncStatus = appwriteSyncService.getStatus();
const cacheWarmStatus = {
  running: false,
  lastReason: null,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
};
const guildSearchJobs = new Map();

function cleanupGuildSearchJobs() {
  const now = Date.now();
  for (const [jobId, job] of guildSearchJobs) {
    const done = job.status === "completed" || job.status === "failed";
    const finishedAtMs = job.finishedAt ? Date.parse(job.finishedAt) : 0;
    if (done && finishedAtMs > 0 && now - finishedAtMs > GUILD_SEARCH_JOB_TTL_MS) {
      guildSearchJobs.delete(jobId);
    }
  }
  if (guildSearchJobs.size <= GUILD_SEARCH_MAX_JOBS) return;
  const oldestDone = [...guildSearchJobs.values()]
    .filter((job) => job.status === "completed" || job.status === "failed")
    .sort((a, b) => Date.parse(a.finishedAt || a.createdAt || 0) - Date.parse(b.finishedAt || b.createdAt || 0));
  while (guildSearchJobs.size > GUILD_SEARCH_MAX_JOBS && oldestDone.length) {
    const item = oldestDone.shift();
    guildSearchJobs.delete(item.id);
  }
}

function gw2MistsRegionToId(region) {
  if (region === "na") return 1;
  return 2;
}

function makeGw2MistsKey() {
  const nowMs = Date.now();
  const left = crypto.randomBytes(8).toString("hex");
  const right = crypto.randomBytes(8).toString("hex");
  return `${nowMs}-${left}-guenther-${right}`;
}

function normalizeGuildSearchText(value) {
  const v = String(value ?? "").trim();
  return v || null;
}

async function fetchGw2MistsGuildSearchPage({ region, search, page, perPage }) {
  const payload = {
    region: gw2MistsRegionToId(region),
    filter: { stat: "kills", teams: [], search, ownAccount: 0 },
    sort: 0,
    sortDir: 0,
    page,
    perPage,
  };
  const res = await fetch(GW2MISTS_PLAYER_V4_ENDPOINT, {
    method: "POST",
    headers: {
      "x-gw2mists-key": makeGw2MistsKey(),
      Origin: "https://gw2mists.com",
      Referer: GW2MISTS_SITE_URL,
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GW2Mists search failed (${res.status})${text ? `: ${text.slice(0, 140)}` : ""}`);
  }
  return res.json();
}

async function runGuildSearchJob(jobId) {
  const job = guildSearchJobs.get(jobId);
  if (!job) return;
  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.error = null;
  try {
    const first = await fetchGw2MistsGuildSearchPage({
      region: job.region,
      search: job.query,
      page: 1,
      perPage: job.perPage,
    });
    const totalAvailable = Math.max(0, Number(first?.total || 0));
    const totalPagesRaw = Math.max(1, Math.ceil(totalAvailable / job.perPage));
    const pagesTotal = Math.min(job.maxPages, totalPagesRaw);
    job.totalAvailable = totalAvailable;
    job.pagesTotal = pagesTotal;
    const seen = new Set();
    const rows = [];
    const addRows = (items, pageNo) => {
      const list = Array.isArray(items) ? items : [];
      for (let i = 0; i < list.length; i += 1) {
        const item = list[i] || {};
        const accountName = sanitizeAccountName(item.accountName || "");
        if (!accountName) continue;
        const key = accountName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          rank: (pageNo - 1) * job.perPage + i + 1,
          accountName,
          teamName: String(item.teamName || "").trim() || "-",
          weeklyKills: Math.max(0, Math.floor(Number(item.kills || 0) || 0)),
          totalKills: Math.max(0, Math.floor(Number(item.maxKills || 0) || 0)),
          wvwGuildName: normalizeGuildSearchText(item.selectedGuildName),
          wvwGuildTag: normalizeGuildSearchText(item.selectedGuildTag),
          allianceGuildName: normalizeGuildSearchText(item.guildName),
          allianceGuildTag: normalizeGuildSearchText(item.guildTag),
        });
      }
      job.pagesFetched = pageNo;
      job.resultCount = rows.length;
    };
    addRows(first?.data, 1);
    for (let page = 2; page <= pagesTotal; page += 1) {
      const data = await fetchGw2MistsGuildSearchPage({
        region: job.region,
        search: job.query,
        page,
        perPage: job.perPage,
      });
      addRows(data?.data, page);
    }
    job.rows = rows;
    job.status = "completed";
    job.finishedAt = new Date().toISOString();
  } catch (err) {
    job.status = "failed";
    job.error = String(err?.message || err || "Guild search failed");
    job.finishedAt = new Date().toISOString();
  }
}

function createGuildSearchJob({ query, region, maxPages, perPage }) {
  cleanupGuildSearchJobs();
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const job = {
    id,
    query,
    region,
    maxPages,
    perPage,
    status: "queued",
    createdAt: nowIso,
    startedAt: null,
    finishedAt: null,
    pagesFetched: 0,
    pagesTotal: null,
    totalAvailable: null,
    resultCount: 0,
    error: null,
    rows: [],
  };
  guildSearchJobs.set(id, job);
  setImmediate(() => {
    runGuildSearchJob(id).catch(() => { });
  });
  return job;
}

function getMaintenanceHealth() {
  return {
    running: maintenanceStatus.running,
    lastRunAt: maintenanceStatus.lastRunAt,
    lastRunReason: maintenanceStatus.lastRunReason,
    lastRetentionDeletedSnapshots: maintenanceStatus.lastRetentionDeletedSnapshots,
    lastRetentionDeletedEntries: maintenanceStatus.lastRetentionDeletedEntries,
    lastVacuumAt: maintenanceStatus.lastVacuumAt,
    lastError: maintenanceStatus.lastError,
    retentionDays: RETENTION_DAYS,
    autoVacuumEnabled: AUTO_VACUUM_ENABLED,
    vacuumMinHours: VACUUM_MIN_HOURS,
  };
}

function isLoopbackIp(ip) {
  const value = String(ip || "").toLowerCase();
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function originFromHeader(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function requireTrustedLocalWrite(request, reply, done) {
  if (!isLoopbackIp(request.ip)) {
    reply.code(403).send({ error: "Forbidden" });
    return;
  }
  const origin = originFromHeader(request.headers.origin);
  const refererOrigin = originFromHeader(request.headers.referer);
  const browserOrigin = origin || refererOrigin;
  if (browserOrigin && !TRUSTED_LOCAL_ORIGINS.has(browserOrigin)) {
    reply.code(403).send({ error: "Forbidden" });
    return;
  }
  const headerToken = String(request.headers["x-admin-token"] || "").trim();
  if (!headerToken || !WRITE_API_TOKEN) {
    reply.code(403).send({ error: "Forbidden" });
    return;
  }
  const left = Buffer.from(headerToken, "utf8");
  const right = Buffer.from(WRITE_API_TOKEN, "utf8");
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    reply.code(403).send({ error: "Forbidden" });
    return;
  }
  done();
}

function requireTrustedLocalRead(request, reply, done) {
  if (!isLoopbackIp(request.ip)) {
    reply.code(403).send({ error: "Forbidden" });
    return;
  }
  const origin = originFromHeader(request.headers.origin);
  const refererOrigin = originFromHeader(request.headers.referer);
  const browserOrigin = origin || refererOrigin;
  if (browserOrigin && !TRUSTED_LOCAL_ORIGINS.has(browserOrigin)) {
    reply.code(403).send({ error: "Forbidden" });
    return;
  }
  done();
}

function maybeVacuum() {
  if (!AUTO_VACUUM_ENABLED) return false;
  const nowMs = Date.now();
  const lastMs = maintenanceStatus.lastVacuumAt
    ? Date.parse(maintenanceStatus.lastVacuumAt)
    : Number.NaN;
  const elapsedMs = Number.isFinite(lastMs) ? nowMs - lastMs : Number.POSITIVE_INFINITY;
  const minMs = VACUUM_MIN_HOURS * 60 * 60 * 1000;
  if (elapsedMs < minMs) return false;
  db.exec("VACUUM");
  maintenanceStatus.lastVacuumAt = new Date(nowMs).toISOString();
  return true;
}

function applyRetention() {
  if (RETENTION_DAYS <= 0) return { snapshotsDeleted: 0, entriesDeleted: 0 };
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const latest = qLatestSnapshot.get();
  if (!latest?.snapshot_id) return { snapshotsDeleted: 0, entriesDeleted: 0 };

  const oldRows = db
    .prepare(
      `
      SELECT snapshot_id
      FROM snapshots
      WHERE created_at < ?
        AND snapshot_id <> ?
      ORDER BY created_at ASC
      `
    )
    .all(cutoffIso, latest.snapshot_id);

  if (!oldRows.length) return { snapshotsDeleted: 0, entriesDeleted: 0 };
  const ids = oldRows.map((r) => r.snapshot_id);
  const placeholders = ids.map(() => "?").join(", ");
  const countEntries = db
    .prepare(`SELECT COUNT(*) AS c FROM snapshot_entries WHERE snapshot_id IN (${placeholders})`)
    .get(...ids).c;

  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM snapshot_entries WHERE snapshot_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM snapshots WHERE snapshot_id IN (${placeholders})`).run(...ids);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { snapshotsDeleted: ids.length, entriesDeleted: Number(countEntries || 0) };
}

async function runMaintenance(reason = "manual") {
  if (maintenanceInProgress) return { skipped: true };
  maintenanceInProgress = true;
  maintenanceStatus.running = true;
  maintenanceStatus.lastRunReason = reason;
  maintenanceStatus.lastError = null;
  try {
    const retention = applyRetention();
    const vacuumed = maybeVacuum();
    if (retention.snapshotsDeleted > 0) clearApiCache();
    maintenanceStatus.lastRunAt = new Date().toISOString();
    maintenanceStatus.lastRetentionDeletedSnapshots = retention.snapshotsDeleted;
    maintenanceStatus.lastRetentionDeletedEntries = retention.entriesDeleted;
    fastify.log.info(
      `[maintenance] Done (${reason}) snapshotsDeleted=${retention.snapshotsDeleted} entriesDeleted=${retention.entriesDeleted} vacuumed=${vacuumed}`
    );
    return { ok: true, ...retention, vacuumed };
  } catch (err) {
    maintenanceStatus.lastError = err.message;
    fastify.log.error(`[maintenance] Failed (${reason}): ${err.message}`);
    throw err;
  } finally {
    maintenanceStatus.running = false;
    maintenanceInProgress = false;
  }
}

function getDeltaLeaderboard({ top = 50, metric = "weeklyKills", scope = "week", weekWindow = null }) {
  return analyticsService.getDeltaLeaderboard({ top, metric, scope, weekWindow });
}

function getAnomalies({ top = 20, minDeltaAbs = 80, lookbackHours = 72, scope = "week", weekWindow = null }) {
  return analyticsService.getAnomalies({ top, minDeltaAbs, lookbackHours, scope, weekWindow });
}

function getResetImpact({ top = 20, windowHours = 3, weekWindow = null }) {
  return analyticsService.getResetImpact({ top, windowHours, weekWindow });
}

function getConsistencyScores({ top = 20, scope = "week", days = null, weekWindow = null }) {
  return analyticsService.getConsistencyScores({ top, scope, days, weekWindow });
}

function getWatchlistAlerts({ accounts = [], minGain = 30, minRankUp = 3, scope = "week", weekWindow = null }) {
  return analyticsService.getWatchlistAlerts({ accounts, minGain, minRankUp, scope, weekWindow });
}

function runSnapshotAsync(trigger) {
  return new Promise((resolve, reject) => {
    if (scrapeInProgress) {
      fastify.log.warn(`[auto-scrape] Skip (${trigger}), previous run still in progress.`);
      reject(new Error("Snapshot already in progress"));
      return;
    }
    scrapeInProgress = true;
    snapshotStatus.running = true;
    snapshotStatus.lastTrigger = trigger;
    snapshotStatus.lastStartedAt = new Date().toISOString();
    snapshotStatus.lastError = null;
    fastify.log.info(`[auto-scrape] Starting snapshot (${trigger})...`);
    const child = spawn(PYTHON_CMD, SCRAPE_ARGS, {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", (err) => {
      scrapeInProgress = false;
      snapshotStatus.running = false;
      snapshotStatus.lastFinishedAt = new Date().toISOString();
      snapshotStatus.lastExitCode = -1;
      snapshotStatus.lastError = err.message;
      fastify.log.error(`[auto-scrape] Failed: ${err.message}`);
      reject(err);
    });
    child.on("close", (code) => {
      scrapeInProgress = false;
      snapshotStatus.running = false;
      snapshotStatus.lastFinishedAt = new Date().toISOString();
      snapshotStatus.lastExitCode = Number(code);
      snapshotStatus.lastError = code === 0 ? null : `Exit code ${code}`;
      fastify.log.info(`[auto-scrape] Finished with exit code ${code}.`);
      if (code === 0) {
        clearApiCache();
        warmApiCacheAfterDataChange("local-snapshot").catch(() => { });
        runMaintenance("post-snapshot").catch(() => { });
      }
      if (code === 0) resolve({ ok: true, exitCode: 0 });
      else reject(new Error(`Snapshot process exited with code ${code}`));
    });
  });
}

function scheduleHourlyScrape() {
  if (!AUTO_SCRAPE_EFFECTIVE) {
    if (!AUTO_SCRAPE_ENABLED) fastify.log.info("[auto-scrape] Disabled (AUTO_SCRAPE=0).");
    else if (APPWRITE_SYNC_ENABLED) {
      fastify.log.info("[auto-scrape] Disabled because Appwrite sync is enabled.");
    }
    return;
  }
  const delay = millisecondsToNextAutoScrape();
  nextHourlyAtIso = new Date(Date.now() + delay).toISOString();
  fastify.log.info(`[auto-scrape] Next snapshot at ${nextHourlyAtIso}.`);
  clearTimeout(scrapeTimer);
  scrapeTimer = setTimeout(() => {
    runSnapshotAsync("scheduled").catch((err) => {
      fastify.log.error(`[auto-scrape] Scheduled run failed: ${err.message}`);
    });
    scheduleHourlyScrape();
  }, delay);
}

async function buildServer() {
  await fastify.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await fastify.register(rateLimit, {
    global: true,
    max: 240,
    timeWindow: "1 minute",
    skipOnError: true,
  });

  fastify.addHook("onSend", async (_req, reply) => {
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.header("Cache-Control", "no-store");
  });

  await registerAllRoutes(fastify, {
    ops: {
      requireTrustedLocalRead,
      requireTrustedLocalWrite,
      WRITE_API_TOKEN,
      withApiCache,
      qSnapshots,
      listSelectableWeekWindows,
      snapshotStatus,
      processStartedAtIso,
      AUTO_SCRAPE_EFFECTIVE,
      AUTO_SCRAPE_ENABLED,
      getNextHourlyAtIso: () => nextHourlyAtIso,
      APPWRITE_SYNC_ENABLED,
      appwriteSyncService,
      appwriteSyncStatus,
      getLatestSnapshotMeta,
      getMaintenanceHealth,
      cacheWarmStatus,
      db,
      runMaintenance,
      runSnapshotAsync,
    },
    analytics: {
      withApiCache,
      resolveWeekSelectionOrReply,
      getDeltaLeaderboard,
      getAnomalies,
      getResetImpact,
      getConsistencyScores,
      parseAccountsParam,
      getWatchlistAlerts,
      getTopProgression,
      qLatestSnapshot,
      qLatestEntries,
      serializeEntryRow,
      sanitizeAccountName,
      qHistory,
      getCurrentWeekWindowBrussels,
      getCompareSeries,
      qAccountSearch,
    },
    share: {
      requireTrustedLocalWrite,
      isValidDiscordWebhookUrl,
      maskDiscordWebhookUrl,
    },
    guild: {
      requireTrustedLocalWrite,
      requireTrustedLocalRead,
      GUILD_SEARCH_MAX_PAGES,
      GUILD_SEARCH_MAX_PER_PAGE,
      createGuildSearchJob,
      cleanupGuildSearchJobs,
      guildSearchJobs,
    },
    static: {
      HAS_DIST,
      DIST_DIR,
      IS_PROD,
    },
  });
}

async function main() {
  await buildServer();
  await runMaintenance("startup").catch(() => { });
  await fastify.listen({ host: HOST, port: PORT });
  fastify.log.info(`API running on http://${HOST}:${PORT}`);
  if (!AUTO_SCRAPE_ENABLED && !APPWRITE_SYNC_ENABLED) {
    fastify.log.warn("[startup] No ingestion mode enabled (AUTO_SCRAPE=0 and APPWRITE_SYNC_ENABLED=0).");
  }
  if (AUTO_SCRAPE_ENABLED && APPWRITE_SYNC_ENABLED) {
    fastify.log.info("[startup] Auto-scrape is configured but disabled because Appwrite sync is enabled.");
  }
  if (APPWRITE_SYNC_ENABLED) {
    const cfgErr = appwriteSyncService.getConfigError();
    if (cfgErr) {
      fastify.log.error(`[appwrite-sync] ${cfgErr}`);
      appwriteSyncStatus.lastError = cfgErr;
    } else {
      fastify.log.info(
        APPWRITE_SYNC_HOURLY_ALIGNED
          ? `[appwrite-sync] Enabled (hourly aligned at :${String(APPWRITE_SYNC_TARGET_MINUTE).padStart(2, "0")} UTC). Initial sync starting...`
          : `[appwrite-sync] Enabled (every ${APPWRITE_SYNC_INTERVAL_MINUTES}m). Initial sync starting...`
      );
      if (appwriteSyncService.shouldRunStartupSync()) {
        appwriteSyncService.runSyncAsync("startup")
          .then((res) => {
            fastify.log.info(
              `[appwrite-sync] Startup sync done fetched=${res.fetched} importedSnapshots=${res.importedSnapshots} importedEntries=${res.importedEntries}`
            );
          })
          .catch((err) => {
            fastify.log.error(`[appwrite-sync] Startup sync failed: ${err.message}`);
          })
          .finally(() => {
            appwriteSyncService.scheduleSync();
            appwriteSyncService.scheduleBackfill();
          });
      } else {
        fastify.log.info(
          `[appwrite-sync] Startup sync skipped: local snapshot is newer than ${APPWRITE_SYNC_STARTUP_MIN_STALE_MINUTES} minute(s).`
        );
        appwriteSyncService.scheduleSync();
        appwriteSyncService.scheduleBackfill();
      }
    }
    if (APPWRITE_BACKFILL_ENABLED && !APPWRITE_FUNCTION_ID) {
      fastify.log.warn("[appwrite-sync] Backfill enabled but APPWRITE_FUNCTION_ID is missing.");
    }
  }
  scheduleHourlyScrape();
}

function shutdown(signal) {
  clearTimeout(scrapeTimer);
  appwriteSyncService.stop();
  fastify.log.info(`Received ${signal}, shutting down...`);
  fastify.close().finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
