const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");
const { spawn } = require("child_process");
require("dotenv").config();
const Fastify = require("fastify");
const helmet = require("@fastify/helmet");
const rateLimit = require("@fastify/rate-limit");
const fastifyStatic = require("@fastify/static");
const { DatabaseSync } = require("node:sqlite");
const appwriteSdk = require("node-appwrite");

const HOST = "127.0.0.1";
const NODE_ENV = process.env.NODE_ENV || "production";
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, "dist");
const DB_PATH = path.join(ROOT, "data", "vox.db");
const IS_PROD = NODE_ENV === "production";
const HAS_DIST = fs.existsSync(DIST_DIR);
const AUTO_SCRAPE_ENABLED = process.env.AUTO_SCRAPE !== "0";
const RETENTION_DAYS = Math.max(0, Number(process.env.RETENTION_DAYS || 0));
const AUTO_VACUUM_ENABLED = process.env.AUTO_VACUUM !== "0";
const VACUUM_MIN_HOURS = Math.max(1, Number(process.env.VACUUM_MIN_HOURS || 24));
const PYTHON_CMD = process.env.PYTHON_CMD || "python";
const APPWRITE_SYNC_ENABLED = process.env.APPWRITE_SYNC_ENABLED === "1";
const APPWRITE_ENDPOINT = String(process.env.APPWRITE_ENDPOINT || "").trim().replace(/\/+$/, "");
const APPWRITE_PROJECT_ID = String(process.env.APPWRITE_PROJECT_ID || "").trim();
const APPWRITE_API_KEY = String(process.env.APPWRITE_API_KEY || "").trim();
const APPWRITE_DATABASE_ID = String(process.env.APPWRITE_DATABASE_ID || "").trim();
const APPWRITE_SNAPSHOTS_COLLECTION_ID = String(process.env.APPWRITE_SNAPSHOTS_COLLECTION_ID || "").trim();
const APPWRITE_ENTRIES_COLLECTION_ID = String(process.env.APPWRITE_ENTRIES_COLLECTION_ID || "").trim();
const APPWRITE_SYNC_INTERVAL_MINUTES = Math.max(
  1,
  Number(process.env.APPWRITE_SYNC_INTERVAL_MINUTES || 60)
);
const APPWRITE_SYNC_HOURLY_ALIGNED = process.env.APPWRITE_SYNC_HOURLY_ALIGNED !== "0";
const APPWRITE_SYNC_TARGET_MINUTE = Math.max(
  0,
  Math.min(59, Number(process.env.APPWRITE_SYNC_TARGET_MINUTE || 12))
);
const APPWRITE_SYNC_ENTRY_BATCH_SIZE = Math.max(
  1,
  Math.min(50, Number(process.env.APPWRITE_SYNC_ENTRY_BATCH_SIZE || 20))
);
const APPWRITE_BACKFILL_ENABLED = process.env.APPWRITE_BACKFILL_ENABLED === "1";
const APPWRITE_BACKFILL_TARGET_MINUTE = Math.max(
  0,
  Math.min(59, Number(process.env.APPWRITE_BACKFILL_TARGET_MINUTE || 30))
);
const APPWRITE_FUNCTION_ID = String(process.env.APPWRITE_FUNCTION_ID || "").trim();
const TRUSTED_LOCAL_ORIGINS = new Set(
  [
    `http://127.0.0.1:${PORT}`,
    `http://localhost:${PORT}`,
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    ...String(process.env.TRUSTED_LOCAL_ORIGINS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  ].map((v) => String(v).replace(/\/+$/, ""))
);
const WRITE_API_TOKEN = String(process.env.WRITE_API_TOKEN || crypto.randomBytes(32).toString("hex")).trim();
const AUTO_SCRAPE_EFFECTIVE = AUTO_SCRAPE_ENABLED && !APPWRITE_SYNC_ENABLED;
const API_CACHE_MAX_ENTRIES = Math.max(100, Number(process.env.API_CACHE_MAX_ENTRIES || 1000));
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

function getBrusselsLocalParts(date) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday,
  };
}

function zonedLocalToUtcMs(year, month, day, hour, minute, second) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 5; i += 1) {
    const p = getBrusselsLocalParts(new Date(guess));
    const desiredPseudo = Date.UTC(year, month - 1, day, hour, minute, second);
    const actualPseudo = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = desiredPseudo - actualPseudo;
    if (diff === 0) return guess;
    guess += diff;
  }
  return guess;
}

function getCurrentWeekWindowBrussels(now = new Date()) {
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const p = getBrusselsLocalParts(now);
  const weekdayIndex = weekdayMap[p.weekday] ?? 0;
  let daysSinceFriday = (weekdayIndex - 5 + 7) % 7;
  if (daysSinceFriday === 0 && p.hour < 19) daysSinceFriday = 7;

  const localAnchor = new Date(Date.UTC(p.year, p.month - 1, p.day));
  localAnchor.setUTCDate(localAnchor.getUTCDate() - daysSinceFriday);
  const startY = localAnchor.getUTCFullYear();
  const startM = localAnchor.getUTCMonth() + 1;
  const startD = localAnchor.getUTCDate();

  const startUtcMs = zonedLocalToUtcMs(startY, startM, startD, 19, 0, 0);
  const localEnd = new Date(Date.UTC(startY, startM - 1, startD));
  localEnd.setUTCDate(localEnd.getUTCDate() + 7);
  const endUtcMs = zonedLocalToUtcMs(
    localEnd.getUTCFullYear(),
    localEnd.getUTCMonth() + 1,
    localEnd.getUTCDate(),
    19,
    0,
    0
  );
  return {
    startUtc: new Date(startUtcMs).toISOString(),
    endUtc: new Date(endUtcMs).toISOString(),
  };
}

function getBrusselsWeekdayIndexForLocalDate(year, month, day) {
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const probeUtcMs = zonedLocalToUtcMs(year, month, day, 12, 0, 0);
  const weekday = getBrusselsLocalParts(new Date(probeUtcMs)).weekday;
  return weekdayMap[weekday] ?? 0;
}

function getAutoScrapeSlotsForWeekday(weekdayIndex) {
  const slots = [];
  for (let hour = 0; hour < 24; hour += 1) {
    if (weekdayIndex === 5 && (hour === 19 || hour === 20)) continue;
    slots.push({ hour, minute: 0 });
  }
  if (weekdayIndex === 5) slots.push({ hour: 18, minute: 45 });
  slots.sort((a, b) => (a.hour - b.hour) || (a.minute - b.minute));
  return slots;
}

function millisecondsToNextAutoScrape(nowMs = Date.now()) {
  const localNow = getBrusselsLocalParts(new Date(nowMs));
  const localMidnight = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
  for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
    const localDay = new Date(localMidnight);
    localDay.setUTCDate(localDay.getUTCDate() + dayOffset);
    const year = localDay.getUTCFullYear();
    const month = localDay.getUTCMonth() + 1;
    const day = localDay.getUTCDate();
    const weekdayIndex = getBrusselsWeekdayIndexForLocalDate(year, month, day);
    const slots = getAutoScrapeSlotsForWeekday(weekdayIndex);
    for (const slot of slots) {
      const candidateMs = zonedLocalToUtcMs(year, month, day, slot.hour, slot.minute, 0);
      if (candidateMs > nowMs + 500) return candidateMs - nowMs;
    }
  }
  return 60 * 60 * 1000;
}

function getLatestSnapshotMetaInWindow(startUtc, endUtc) {
  const snap = db
    .prepare(
      `
      SELECT snapshot_id, created_at, region, count
      FROM snapshots
      WHERE created_at >= ? AND created_at < ?
        AND EXISTS (
          SELECT 1
          FROM snapshot_entries e
          WHERE e.snapshot_id = snapshots.snapshot_id
        )
      ORDER BY created_at DESC
      LIMIT 1
      `
    )
    .get(startUtc, endUtc);
  if (!snap || !snap.snapshot_id) return null;
  return {
    snapshotId: snap.snapshot_id,
    createdAt: snap.created_at,
    region: snap.region,
    count: snap.count,
  };
}

function getTopProgression(top, scope = "week", days = null) {
  const weekWindow = getCurrentWeekWindowBrussels();
  const hasDaysFilter = scope === "all" && Number.isFinite(Number(days)) && Number(days) > 0;
  const cutoffIso = hasDaysFilter
    ? new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const latest =
    scope === "week"
      ? getLatestSnapshotMetaInWindow(weekWindow.startUtc, weekWindow.endUtc)
      : getLatestSnapshotMeta();
  if (!latest) return { latest: null, labels: [], series: {} };

  const topRows = db
    .prepare(
      `
      SELECT account_name
      FROM snapshot_entries
      WHERE snapshot_id = ?
      ORDER BY rank ASC
      LIMIT ?
      `
    )
    .all(latest.snapshotId, top);

  const accounts = topRows.map((r) => r.account_name);
  if (!accounts.length) return { latest, labels: [], series: {} };

  const placeholders = accounts.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
      SELECT
        s.created_at AS createdAt,
        e.account_name AS accountName,
        e.rank AS rank,
        e.weekly_kills AS weeklyKills,
        e.total_kills AS totalKills
      FROM snapshot_entries e
      JOIN snapshots s ON s.snapshot_id = e.snapshot_id
      WHERE e.account_name IN (${placeholders})
      ${scope === "week" ? "AND s.created_at >= ? AND s.created_at < ?" : ""}
      ${hasDaysFilter ? "AND s.created_at >= ?" : ""}
      ORDER BY s.created_at ASC, e.rank ASC
      `
    )
    .all(
      ...accounts,
      ...(scope === "week" ? [weekWindow.startUtc, weekWindow.endUtc] : []),
      ...(hasDaysFilter ? [cutoffIso] : [])
    );

  const labelsSet = new Set();
  const series = {};
  for (const account of accounts) series[account] = [];
  for (const row of rows) {
    labelsSet.add(row.createdAt);
    series[row.accountName].push({
      createdAt: row.createdAt,
      rank: row.rank,
      weeklyKills: row.weeklyKills,
      totalKills: row.totalKills,
    });
  }
  return {
    latest,
    labels: [...labelsSet].sort(),
    series,
    scope,
    days: hasDaysFilter ? Number(days) : null,
    weekWindow: scope === "week" ? weekWindow : null,
  };
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
  const series = {};
  for (const account of accounts) series[account] = [];
  if (!accounts.length) return series;

  const placeholders = accounts.map(() => "?").join(", ");
  const whereParts = [`e.account_name IN (${placeholders})`];
  const params = [...accounts];
  if (scope === "week") {
    whereParts.push("s.created_at >= ?");
    whereParts.push("s.created_at < ?");
    params.push(weekWindow.startUtc, weekWindow.endUtc);
  } else if (hasDaysFilter) {
    whereParts.push("s.created_at >= ?");
    params.push(cutoffIso);
  }

  const rows = db
    .prepare(
      `
      SELECT
        s.snapshot_id AS snapshotId,
        s.created_at AS createdAt,
        e.rank AS rank,
        e.weekly_kills AS weeklyKills,
        e.total_kills AS totalKills,
        e.account_name AS accountName
      FROM snapshot_entries e
      JOIN snapshots s ON s.snapshot_id = e.snapshot_id
      WHERE ${whereParts.join(" AND ")}
      ORDER BY s.created_at ASC
      `
    )
    .all(...params);

  const accountMap = new Map(accounts.map((account) => [account.toLowerCase(), account]));
  for (const row of rows) {
    const accountKey = accountMap.get(String(row.accountName || "").toLowerCase());
    if (!accountKey) continue;
    series[accountKey].push(row);
  }
  return series;
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

function getAppwriteSyncConfigError() {
  if (!APPWRITE_SYNC_ENABLED) return null;
  const required = [
    ["APPWRITE_ENDPOINT", APPWRITE_ENDPOINT],
    ["APPWRITE_PROJECT_ID", APPWRITE_PROJECT_ID],
    ["APPWRITE_API_KEY", APPWRITE_API_KEY],
    ["APPWRITE_DATABASE_ID", APPWRITE_DATABASE_ID],
    ["APPWRITE_SNAPSHOTS_COLLECTION_ID", APPWRITE_SNAPSHOTS_COLLECTION_ID],
    ["APPWRITE_ENTRIES_COLLECTION_ID", APPWRITE_ENTRIES_COLLECTION_ID],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) return `Missing Appwrite env vars: ${missing.join(", ")}`;
  return null;
}

function getAppwriteBackfillConfigError() {
  if (!APPWRITE_SYNC_ENABLED || !APPWRITE_BACKFILL_ENABLED) return null;
  if (!APPWRITE_FUNCTION_ID) return "Missing Appwrite env var: APPWRITE_FUNCTION_ID";
  return null;
}

function appwriteApiBase() {
  return APPWRITE_ENDPOINT.endsWith("/v1") ? APPWRITE_ENDPOINT : `${APPWRITE_ENDPOINT}/v1`;
}

let appwriteDatabasesClient = null;

function getAppwriteDatabasesClient() {
  if (appwriteDatabasesClient) return appwriteDatabasesClient;
  const endpoint = APPWRITE_ENDPOINT.endsWith("/v1") ? APPWRITE_ENDPOINT : `${APPWRITE_ENDPOINT}/v1`;
  const client = new appwriteSdk.Client()
    .setEndpoint(endpoint)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);
  appwriteDatabasesClient = new appwriteSdk.Databases(client);
  return appwriteDatabasesClient;
}

async function appwriteListAllDocuments(
  collectionId,
  { orderBy = "$createdAt", greaterThanCreatedAt = null, extraQueries = [] } = {}
) {
  const databases = getAppwriteDatabasesClient();
  const out = [];
  const pageSize = 100;
  let cursorAfter = null;
  let loopGuard = 0;
  while (loopGuard < 2000) {
    loopGuard += 1;
    const queries = [appwriteSdk.Query.limit(pageSize)];
    if (orderBy) queries.push(appwriteSdk.Query.orderAsc(orderBy));
    if (greaterThanCreatedAt) queries.push(appwriteSdk.Query.greaterThan("createdAt", greaterThanCreatedAt));
    if (Array.isArray(extraQueries) && extraQueries.length) queries.push(...extraQueries);
    if (cursorAfter) queries.push(appwriteSdk.Query.cursorAfter(cursorAfter));

    const page = await databases.listDocuments(APPWRITE_DATABASE_ID, collectionId, queries);
    const docs = Array.isArray(page?.documents) ? page.documents : [];
    if (!docs.length) break;
    out.push(...docs);
    if (docs.length < pageSize) break;
    cursorAfter = docs[docs.length - 1].$id;
  }
  if (loopGuard >= 2000) throw new Error("Appwrite pagination guard exceeded");
  return out;
}

async function appwriteListEntriesBySnapshotIds(snapshotIds) {
  const bySnapshot = new Map(snapshotIds.map((id) => [id, []]));
  if (!snapshotIds.length) return bySnapshot;
  const idChunks = chunkArray(snapshotIds, APPWRITE_SYNC_ENTRY_BATCH_SIZE);
  for (const ids of idChunks) {
    const docs = await appwriteListAllDocuments(APPWRITE_ENTRIES_COLLECTION_ID, {
      orderBy: "$createdAt",
      extraQueries: [appwriteSdk.Query.equal("snapshotId", ids)],
    });
    for (const doc of docs) {
      const snapshotId = String(doc?.snapshotId || doc?.snapshot_id || "").trim();
      if (!snapshotId || !bySnapshot.has(snapshotId)) continue;
      bySnapshot.get(snapshotId).push(doc);
    }
  }
  return bySnapshot;
}

function mapAppwriteSnapshotDocument(doc) {
  const snapshotId = String(doc?.snapshotId || doc?.snapshot_id || doc?.$id || "").trim();
  const createdAt = String(doc?.createdAt || doc?.created_at || "").trim();
  if (!snapshotId || !createdAt) return null;
  return {
    snapshotId,
    createdAt,
    source: String(doc?.source || "appwrite").trim() || "appwrite",
    region: String(doc?.region || "eu").trim() || "eu",
    pages: Number(doc?.pages || 3) || 3,
    perPage: Number(doc?.perPage || doc?.per_page || 100) || 100,
    totalAvailable: Number(doc?.totalAvailable || doc?.total_available || 0) || 0,
    count: Number(doc?.count || 0) || 0,
  };
}

function mapAppwriteEntryDocument(doc) {
  const rank = Number(doc?.rank);
  const accountName = sanitizeAccountName(doc?.accountName || doc?.account_name || "");
  if (!Number.isFinite(rank) || rank <= 0 || !accountName) return null;
  return {
    rank: Math.floor(rank),
    accountName,
    weeklyKills: Number(doc?.weeklyKills || doc?.weekly_kills || 0) || 0,
    totalKills: Number(doc?.totalKills || doc?.total_kills || 0) || 0,
    wvwGuildName: normalizeOptionalText(
      doc?.wvwGuildName || doc?.wvw_guild_name || doc?.allianceName || doc?.alliance_name || doc?.selectedGuildName
    ),
    wvwGuildTag: normalizeOptionalText(
      doc?.wvwGuildTag || doc?.wvw_guild_tag || doc?.allianceTag || doc?.alliance_tag || doc?.selectedGuildTag
    ),
    allianceGuildName: normalizeOptionalText(
      doc?.allianceGuildName || doc?.alliance_guild_name || doc?.guildName || doc?.guild_name
    ),
    allianceGuildTag: normalizeOptionalText(
      doc?.allianceGuildTag || doc?.alliance_guild_tag || doc?.guildTag || doc?.guild_tag
    ),
  };
}

function importSnapshotIntoLocalDb(snapshot, entries) {
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
      Math.max(0, Math.floor(snapshot.count || entries.length))
    );
    qDeleteSnapshotEntries.run(snapshot.snapshotId);
    for (const entry of entries) {
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

async function runAppwriteSyncAsync(trigger) {
  if (!APPWRITE_SYNC_ENABLED) return { skipped: true, reason: "disabled" };
  if (appwriteSyncInProgress) return { skipped: true, reason: "in_progress" };

  const configError = getAppwriteSyncConfigError();
  if (configError) {
    appwriteSyncStatus.lastError = configError;
    throw new Error(configError);
  }

  appwriteSyncInProgress = true;
  appwriteSyncStatus.running = true;
  appwriteSyncStatus.lastTrigger = trigger;
  appwriteSyncStatus.lastStartedAt = new Date().toISOString();
  appwriteSyncStatus.lastError = null;

  try {
    const latestLocal = qLatestSnapshot.get();
    const latestLocalCreatedAt = latestLocal?.created_at || null;
    const snapshotDocs = await appwriteListAllDocuments(APPWRITE_SNAPSHOTS_COLLECTION_ID, {
      orderBy: "createdAt",
      greaterThanCreatedAt: latestLocalCreatedAt,
    });
    appwriteSyncStatus.lastFetchedSnapshots = snapshotDocs.length;

    const pendingSnapshots = snapshotDocs
      .map(mapAppwriteSnapshotDocument)
      .filter(Boolean)
      .filter((snapshot) => !qSnapshotExists.get(snapshot.snapshotId));
    const pendingSnapshotIds = pendingSnapshots.map((s) => s.snapshotId);
    const entryDocsBySnapshotId = await appwriteListEntriesBySnapshotIds(pendingSnapshotIds);

    let importedSnapshots = 0;
    let importedEntries = 0;
    for (const snapshot of pendingSnapshots) {
      const entryDocs = entryDocsBySnapshotId.get(snapshot.snapshotId) || [];
      const entries = entryDocs
        .map(mapAppwriteEntryDocument)
        .filter(Boolean)
        .sort((a, b) => a.rank - b.rank);
      const expectedCount = Math.max(0, Number(snapshot.count || 0));
      const minAccepted = expectedCount > 0 ? Math.max(20, Math.floor(expectedCount * 0.9)) : 1;
      if (entries.length < minAccepted) {
        fastify.log.warn(
          `[appwrite-sync] Skip snapshot ${snapshot.snapshotId}: entries=${entries.length}, expected=${expectedCount}`
        );
        continue;
      }
      importSnapshotIntoLocalDb(snapshot, entries);
      importedSnapshots += 1;
      importedEntries += entries.length;
    }

    appwriteSyncStatus.lastImportedSnapshots = importedSnapshots;
    appwriteSyncStatus.lastImportedEntries = importedEntries;
    appwriteSyncStatus.lastFinishedAt = new Date().toISOString();

    if (importedSnapshots > 0) {
      clearApiCache();
      warmApiCacheAfterDataChange("appwrite-sync").catch(() => { });
      runMaintenance("post-appwrite-sync").catch(() => { });
    }
    return { ok: true, fetched: snapshotDocs.length, importedSnapshots, importedEntries };
  } catch (err) {
    appwriteSyncStatus.lastError = err.message;
    appwriteSyncStatus.lastFinishedAt = new Date().toISOString();
    throw err;
  } finally {
    appwriteSyncStatus.running = false;
    appwriteSyncInProgress = false;
  }
}

function currentUtcHourSnapshotInfo() {
  const now = new Date();
  const hourUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0)
  );
  const createdAt = hourUtc.toISOString().replace(".000Z", "+00:00");
  return {
    snapshotId: createdAt.replace(/:/g, "-"),
    createdAt,
  };
}

async function triggerAppwriteFunctionExecution() {
  const endpoint = `${appwriteApiBase()}/functions/${encodeURIComponent(APPWRITE_FUNCTION_ID)}/executions`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-Appwrite-Project": APPWRITE_PROJECT_ID,
      "X-Appwrite-Key": APPWRITE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ async: false }),
  });
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    const msg = payload?.message || payload?.raw || `HTTP ${res.status}`;
    throw new Error(`Appwrite function trigger failed: ${msg}`);
  }
  return payload;
}

async function runAppwriteBackfillGuard(trigger) {
  if (!APPWRITE_SYNC_ENABLED || !APPWRITE_BACKFILL_ENABLED) return { skipped: true, reason: "disabled" };
  const configError = getAppwriteBackfillConfigError();
  if (configError) {
    appwriteSyncStatus.lastError = configError;
    throw new Error(configError);
  }

  const expected = currentUtcHourSnapshotInfo();
  const databases = getAppwriteDatabasesClient();
  const page = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_SNAPSHOTS_COLLECTION_ID, [
    appwriteSdk.Query.equal("snapshotId", [expected.snapshotId]),
    appwriteSdk.Query.limit(1),
  ]);
  if ((page?.documents || []).length > 0) {
    return { skipped: true, reason: "snapshot_exists", expectedSnapshotId: expected.snapshotId };
  }

  fastify.log.warn(
    `[appwrite-backfill] Missing snapshot ${expected.snapshotId}. Triggering function ${APPWRITE_FUNCTION_ID} (${trigger}).`
  );
  const execution = await triggerAppwriteFunctionExecution();
  let syncResult = null;
  try {
    syncResult = await runAppwriteSyncAsync("backfill-guard");
  } catch (err) {
    fastify.log.warn(`[appwrite-backfill] Triggered function but sync failed: ${err.message}`);
  }
  return {
    ok: true,
    triggered: true,
    expectedSnapshotId: expected.snapshotId,
    executionId: execution?.$id || null,
    syncResult,
  };
}

function scheduleAppwriteSync(delayMs = null) {
  if (!APPWRITE_SYNC_ENABLED) return;
  const hasExplicitDelay = typeof delayMs === "number" && Number.isFinite(delayMs);
  let delay = hasExplicitDelay ? Math.max(250, delayMs) : APPWRITE_SYNC_INTERVAL_MINUTES * 60 * 1000;
  if (!hasExplicitDelay && APPWRITE_SYNC_HOURLY_ALIGNED) {
    const now = new Date();
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMinutes(APPWRITE_SYNC_TARGET_MINUTE);
    if (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 1);
    delay = Math.max(250, next.getTime() - now.getTime());
  }
  nextAppwriteSyncAtIso = new Date(Date.now() + delay).toISOString();
  clearTimeout(appwriteSyncTimer);
  appwriteSyncTimer = setTimeout(async () => {
    try {
      await runAppwriteSyncAsync("timer");
    } catch (err) {
      fastify.log.error(`[appwrite-sync] Failed: ${err.message}`);
    } finally {
      scheduleAppwriteSync();
    }
  }, delay);
}

function millisecondsToNextUtcMinute(targetMinute) {
  const now = new Date();
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(targetMinute);
  if (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 1);
  return next.getTime() - now.getTime();
}

function scheduleAppwriteBackfill(delayMs = null) {
  if (!APPWRITE_SYNC_ENABLED || !APPWRITE_BACKFILL_ENABLED) return;
  const cfgErr = getAppwriteBackfillConfigError();
  if (cfgErr) {
    fastify.log.error(`[appwrite-backfill] ${cfgErr}`);
    return;
  }
  const hasExplicitDelay = typeof delayMs === "number" && Number.isFinite(delayMs);
  const delay = hasExplicitDelay ? Math.max(250, delayMs) : Math.max(250, millisecondsToNextUtcMinute(APPWRITE_BACKFILL_TARGET_MINUTE));
  clearTimeout(appwriteBackfillTimer);
  appwriteBackfillTimer = setTimeout(async () => {
    try {
      const result = await runAppwriteBackfillGuard("timer");
      if (!result?.skipped) {
        fastify.log.info(
          `[appwrite-backfill] Triggered executionId=${result.executionId || "-"} expectedSnapshot=${result.expectedSnapshotId}`
        );
      }
    } catch (err) {
      fastify.log.error(`[appwrite-backfill] Failed: ${err.message}`);
    } finally {
      scheduleAppwriteBackfill();
    }
  }, delay);
}

let scrapeInProgress = false;
let scrapeTimer = null;
let appwriteSyncInProgress = false;
let appwriteSyncTimer = null;
let appwriteBackfillTimer = null;
let nextHourlyAtIso = null;
let nextAppwriteSyncAtIso = null;
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
const appwriteSyncStatus = {
  enabled: APPWRITE_SYNC_ENABLED,
  running: false,
  lastTrigger: null,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
  lastFetchedSnapshots: 0,
  lastImportedSnapshots: 0,
  lastImportedEntries: 0,
};
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

function getDeltaLeaderboard({ top = 50, metric = "weeklyKills", scope = "week" }) {
  const metricKey = metric === "totalKills" ? "total_kills" : "weekly_kills";
  const weekWindow = getCurrentWeekWindowBrussels();
  const latest =
    scope === "week"
      ? getLatestSnapshotMetaInWindow(weekWindow.startUtc, weekWindow.endUtc)
      : getLatestSnapshotMeta();
  if (!latest) return { latest: null, previous: null, rows: [], scope, weekWindow: null };

  const prevSql = `
    SELECT snapshot_id, created_at, region, count
    FROM snapshots
    WHERE created_at < ?
    ${scope === "week" ? "AND created_at >= ? AND created_at < ?" : ""}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const previous =
    scope === "week"
      ? db.prepare(prevSql).get(latest.createdAt, weekWindow.startUtc, weekWindow.endUtc)
      : db.prepare(prevSql).get(latest.createdAt);
  if (!previous?.snapshot_id) {
    return {
      latest,
      previous: null,
      rows: [],
      scope,
      weekWindow: scope === "week" ? weekWindow : null,
    };
  }

  const latestRows = db
    .prepare(
      `
      SELECT rank, account_name, weekly_kills, total_kills
      FROM snapshot_entries
      WHERE snapshot_id = ?
      ORDER BY rank ASC
      LIMIT ?
      `
    )
    .all(latest.snapshotId, 300);
  const prevRows = db
    .prepare(
      `
      SELECT rank, account_name, weekly_kills, total_kills
      FROM snapshot_entries
      WHERE snapshot_id = ?
      ORDER BY rank ASC
      LIMIT 300
      `
    )
    .all(previous.snapshot_id);
  const prevMap = new Map(prevRows.map((r) => [String(r.account_name).toLowerCase(), r]));
  const rows = latestRows
    .map((row) => {
      const prev = prevMap.get(String(row.account_name).toLowerCase());
      const weeklyDelta = Number(row.weekly_kills || 0) - Number(prev?.weekly_kills || 0);
      const totalDelta = Number(row.total_kills || 0) - Number(prev?.total_kills || 0);
      const previousRank = Number(prev?.rank || 0) || null;
      return {
        accountName: row.account_name,
        latestRank: row.rank,
        previousRank,
        rankChange: previousRank ? previousRank - row.rank : null,
        latestWeeklyKills: row.weekly_kills,
        previousWeeklyKills: prev?.weekly_kills ?? null,
        weeklyKillsDelta: weeklyDelta,
        latestTotalKills: row.total_kills,
        previousTotalKills: prev?.total_kills ?? null,
        totalKillsDelta: totalDelta,
      };
    })
    .sort((a, b) => Number(b[metricKey === "total_kills" ? "totalKillsDelta" : "weeklyKillsDelta"]) -
      Number(a[metricKey === "total_kills" ? "totalKillsDelta" : "weeklyKillsDelta"]))
    .slice(0, top);
  return {
    latest,
    previous: {
      snapshotId: previous.snapshot_id,
      createdAt: previous.created_at,
      region: previous.region,
      count: previous.count,
    },
    rows,
    scope,
    weekWindow: scope === "week" ? weekWindow : null,
  };
}

function getAnomalies({ top = 20, minDeltaAbs = 80, lookbackHours = 72, scope = "week" }) {
  const weekWindow = getCurrentWeekWindowBrussels();
  const latest =
    scope === "week"
      ? getLatestSnapshotMetaInWindow(weekWindow.startUtc, weekWindow.endUtc)
      : getLatestSnapshotMeta();
  if (!latest) return { latest: null, anomalies: [], scope, weekWindow: null };

  const accounts = db
    .prepare(
      `
      SELECT account_name
      FROM snapshot_entries
      WHERE snapshot_id = ?
      ORDER BY rank ASC
      LIMIT 120
      `
    )
    .all(latest.snapshotId)
    .map((r) => r.account_name);
  if (!accounts.length) return { latest, anomalies: [], scope, weekWindow: scope === "week" ? weekWindow : null };

  const fromIso = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const placeholders = accounts.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
      SELECT s.created_at AS createdAt, e.account_name AS accountName, e.weekly_kills AS weeklyKills
      FROM snapshot_entries e
      JOIN snapshots s ON s.snapshot_id = e.snapshot_id
      WHERE e.account_name IN (${placeholders})
      AND s.created_at >= ?
      ${scope === "week" ? "AND s.created_at >= ? AND s.created_at < ?" : ""}
      ORDER BY e.account_name ASC, s.created_at ASC
      `
    )
    .all(
      ...accounts,
      fromIso,
      ...(scope === "week" ? [weekWindow.startUtc, weekWindow.endUtc] : [])
    );

  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.accountName);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const anomalies = [];
  for (const [accountName, points] of grouped.entries()) {
    if (points.length < 4) continue;
    const deltas = [];
    for (let i = 1; i < points.length; i += 1) {
      const prev = Number(points[i - 1].weeklyKills || 0);
      const curr = Number(points[i].weeklyKills || 0);
      deltas.push({
        delta: curr - prev,
        createdAt: points[i].createdAt,
      });
    }
    if (deltas.length < 3) continue;
    const latestDelta = deltas[deltas.length - 1];
    const history = deltas.slice(0, -1).map((d) => d.delta);
    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    const diff = latestDelta.delta - avg;
    if (Math.abs(diff) < minDeltaAbs) continue;
    const baseline = Math.max(1, Math.abs(avg));
    const pct = Math.round((diff / baseline) * 100);
    anomalies.push({
      accountName,
      createdAt: latestDelta.createdAt,
      latestDelta: latestDelta.delta,
      baselineAvg: Math.round(avg),
      deviation: Math.round(diff),
      deviationPct: pct,
      severity: Math.abs(diff),
      direction: diff >= 0 ? "spike" : "drop",
    });
  }

  anomalies.sort((a, b) => b.severity - a.severity);
  return {
    latest,
    anomalies: anomalies.slice(0, top),
    scope,
    weekWindow: scope === "week" ? weekWindow : null,
  };
}

function getResetImpact({ top = 20, windowHours = 3 }) {
  const weekWindow = getCurrentWeekWindowBrussels();
  const base = db
    .prepare(
      `
      SELECT snapshot_id, created_at, region, count
      FROM snapshots
      WHERE created_at >= ? AND created_at < ?
      ORDER BY created_at ASC
      LIMIT 1
      `
    )
    .get(weekWindow.startUtc, weekWindow.endUtc);
  if (!base?.snapshot_id) {
    return { weekWindow, windowHours, base: null, target: null, rows: [] };
  }

  const cutoffMs = Math.min(
    Date.parse(weekWindow.endUtc),
    Date.parse(weekWindow.startUtc) + Math.max(1, Number(windowHours)) * 60 * 60 * 1000
  );
  const cutoffIso = new Date(cutoffMs).toISOString();
  const target = db
    .prepare(
      `
      SELECT snapshot_id, created_at, region, count
      FROM snapshots
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
      LIMIT 1
      `
    )
    .get(weekWindow.startUtc, cutoffIso);
  if (!target?.snapshot_id) {
    return {
      weekWindow,
      windowHours,
      base: { snapshotId: base.snapshot_id, createdAt: base.created_at, region: base.region, count: base.count },
      target: null,
      rows: [],
    };
  }

  const joinedRows = db
    .prepare(
      `
      SELECT
        t.account_name AS accountName,
        b.rank AS startRank,
        t.rank AS endRank,
        b.weekly_kills AS startWeeklyKills,
        t.weekly_kills AS endWeeklyKills,
        b.total_kills AS startTotalKills,
        t.total_kills AS endTotalKills
      FROM snapshot_entries t
      JOIN snapshot_entries b
        ON b.snapshot_id = ?
       AND t.snapshot_id = ?
       AND b.account_name = t.account_name COLLATE NOCASE
      `
    )
    .all(base.snapshot_id, target.snapshot_id);

  const rows = joinedRows
    .map((row) => ({
      accountName: row.accountName,
      startRank: row.startRank,
      endRank: row.endRank,
      rankGain: Number(row.startRank || 0) - Number(row.endRank || 0),
      startWeeklyKills: Number(row.startWeeklyKills || 0),
      endWeeklyKills: Number(row.endWeeklyKills || 0),
      gain: Number(row.endWeeklyKills || 0) - Number(row.startWeeklyKills || 0),
      startTotalKills: Number(row.startTotalKills || 0),
      endTotalKills: Number(row.endTotalKills || 0),
      totalGain: Number(row.endTotalKills || 0) - Number(row.startTotalKills || 0),
    }))
    .filter((row) => row.gain > 0)
    .sort((a, b) => b.gain - a.gain || b.rankGain - a.rankGain)
    .slice(0, top);

  return {
    weekWindow,
    windowHours: Math.max(1, Number(windowHours)),
    base: { snapshotId: base.snapshot_id, createdAt: base.created_at, region: base.region, count: base.count },
    target: { snapshotId: target.snapshot_id, createdAt: target.created_at, region: target.region, count: target.count },
    rows,
  };
}

function getConsistencyScores({ top = 20, scope = "week", days = null }) {
  const weekWindow = getCurrentWeekWindowBrussels();
  const hasDaysFilter = scope === "all" && Number.isFinite(Number(days)) && Number(days) > 0;
  const cutoffIso = hasDaysFilter
    ? new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const latest =
    scope === "week"
      ? getLatestSnapshotMetaInWindow(weekWindow.startUtc, weekWindow.endUtc)
      : getLatestSnapshotMeta();
  if (!latest) return { latest: null, rows: [], scope, days: hasDaysFilter ? Number(days) : null, weekWindow: null };

  const accounts = db
    .prepare(
      `
      SELECT account_name
      FROM snapshot_entries
      WHERE snapshot_id = ?
      ORDER BY rank ASC
      LIMIT 150
      `
    )
    .all(latest.snapshotId)
    .map((r) => r.account_name);
  if (!accounts.length) {
    return {
      latest,
      rows: [],
      scope,
      days: hasDaysFilter ? Number(days) : null,
      weekWindow: scope === "week" ? weekWindow : null,
    };
  }

  const placeholders = accounts.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
      SELECT
        s.created_at AS createdAt,
        e.account_name AS accountName,
        e.weekly_kills AS weeklyKills
      FROM snapshot_entries e
      JOIN snapshots s ON s.snapshot_id = e.snapshot_id
      WHERE e.account_name IN (${placeholders})
      ${scope === "week" ? "AND s.created_at >= ? AND s.created_at < ?" : ""}
      ${hasDaysFilter ? "AND s.created_at >= ?" : ""}
      ORDER BY e.account_name ASC, s.created_at ASC
      `
    )
    .all(
      ...accounts,
      ...(scope === "week" ? [weekWindow.startUtc, weekWindow.endUtc] : []),
      ...(hasDaysFilter ? [cutoffIso] : [])
    );

  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.accountName);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const scored = [];
  for (const [accountName, points] of grouped.entries()) {
    if (points.length < 4) continue;
    const deltas = [];
    for (let i = 1; i < points.length; i += 1) {
      const prev = Number(points[i - 1].weeklyKills || 0);
      const curr = Number(points[i].weeklyKills || 0);
      deltas.push(Math.max(0, curr - prev));
    }
    if (deltas.length < 3) continue;

    const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
    const variance = deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / deltas.length;
    const stddev = Math.sqrt(variance);
    const cv = stddev / (Math.abs(mean) + 1);
    const consistencyScore = Math.round(Math.max(0, Math.min(100, 100 / (1 + cv))));
    const activeIntervals = deltas.filter((d) => d > 0).length;
    const totalGain = deltas.reduce((sum, value) => sum + value, 0);
    scored.push({
      accountName,
      consistencyScore,
      avgDelta: Math.round(mean),
      stddevDelta: Math.round(stddev),
      activeIntervals,
      totalGain,
      sampleSize: deltas.length,
    });
  }

  scored.sort((a, b) => b.consistencyScore - a.consistencyScore || b.totalGain - a.totalGain);
  return {
    latest,
    rows: scored.slice(0, top),
    scope,
    days: hasDaysFilter ? Number(days) : null,
    weekWindow: scope === "week" ? weekWindow : null,
  };
}

function getWatchlistAlerts({ accounts = [], minGain = 30, minRankUp = 3, scope = "week" }) {
  const weekWindow = getCurrentWeekWindowBrussels();
  const latest =
    scope === "week"
      ? getLatestSnapshotMetaInWindow(weekWindow.startUtc, weekWindow.endUtc)
      : getLatestSnapshotMeta();
  if (!latest) return { latest: null, previous: null, scope, weekWindow: null, rows: [] };
  if (!accounts.length) {
    return { latest, previous: null, scope, weekWindow: scope === "week" ? weekWindow : null, rows: [] };
  }

  const prevSql = `
    SELECT snapshot_id, created_at, region, count
    FROM snapshots
    WHERE created_at < ?
    ${scope === "week" ? "AND created_at >= ? AND created_at < ?" : ""}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const previous =
    scope === "week"
      ? db.prepare(prevSql).get(latest.createdAt, weekWindow.startUtc, weekWindow.endUtc)
      : db.prepare(prevSql).get(latest.createdAt);
  if (!previous?.snapshot_id) {
    return {
      latest,
      previous: null,
      scope,
      weekWindow: scope === "week" ? weekWindow : null,
      rows: accounts.map((accountName) => ({ requestedAccount: accountName, found: false })),
    };
  }

  const latestRows = db
    .prepare(
      `
      SELECT rank, account_name, weekly_kills, total_kills
      FROM snapshot_entries
      WHERE snapshot_id = ?
      ORDER BY rank ASC
      LIMIT 300
      `
    )
    .all(latest.snapshotId);
  const prevRows = db
    .prepare(
      `
      SELECT rank, account_name, weekly_kills, total_kills
      FROM snapshot_entries
      WHERE snapshot_id = ?
      ORDER BY rank ASC
      LIMIT 300
      `
    )
    .all(previous.snapshot_id);

  const latestMap = new Map(latestRows.map((row) => [String(row.account_name).toLowerCase(), row]));
  const prevMap = new Map(prevRows.map((row) => [String(row.account_name).toLowerCase(), row]));
  const rows = accounts.map((requestedAccount) => {
    const key = requestedAccount.toLowerCase();
    const current = latestMap.get(key);
    const prev = prevMap.get(key);
    if (!current) return { requestedAccount, found: false };
    const weeklyGain = Number(current.weekly_kills || 0) - Number(prev?.weekly_kills || 0);
    const totalGain = Number(current.total_kills || 0) - Number(prev?.total_kills || 0);
    const previousRank = Number(prev?.rank || 0) || null;
    const rankChange = previousRank ? previousRank - Number(current.rank || 0) : null;
    const triggered =
      weeklyGain >= Math.max(0, Number(minGain)) ||
      (Number.isFinite(rankChange) && rankChange >= Math.max(0, Number(minRankUp)));
    return {
      requestedAccount,
      accountName: current.account_name,
      found: true,
      latestRank: Number(current.rank || 0),
      previousRank,
      rankChange,
      latestWeeklyKills: Number(current.weekly_kills || 0),
      previousWeeklyKills: prev ? Number(prev.weekly_kills || 0) : null,
      weeklyGain,
      latestTotalKills: Number(current.total_kills || 0),
      previousTotalKills: prev ? Number(prev.total_kills || 0) : null,
      totalGain,
      triggered,
    };
  });

  return {
    latest,
    previous: {
      snapshotId: previous.snapshot_id,
      createdAt: previous.created_at,
      region: previous.region,
      count: previous.count,
    },
    scope,
    weekWindow: scope === "week" ? weekWindow : null,
    minGain: Math.max(0, Number(minGain)),
    minRankUp: Math.max(0, Number(minRankUp)),
    rows,
  };
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

  fastify.get(
    "/api/write-auth",
    {
      preHandler: requireTrustedLocalRead,
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              token: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({ token: WRITE_API_TOKEN })
  );

  fastify.get("/api/snapshots", async () => {
    return withApiCache("snapshots", {}, 60_000, async () => {
      const snapshots = qSnapshots.all().map((row) => ({
        snapshotId: row.snapshot_id,
        createdAt: row.created_at,
        region: row.region,
        count: row.count,
      }));
      return { snapshots };
    });
  });

  fastify.get(
    "/api/snapshot/status",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              running: { type: "boolean" },
              lastTrigger: { type: ["string", "null"] },
              lastStartedAt: { type: ["string", "null"] },
              lastFinishedAt: { type: ["string", "null"] },
              lastExitCode: { type: ["integer", "null"] },
              lastError: { type: ["string", "null"] },
            },
          },
        },
      },
    },
    async () => snapshotStatus
  );

  fastify.get(
    "/api/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              processStartedAt: { type: "string" },
              uptimeSeconds: { type: "integer" },
              autoScrapeEnabled: { type: "boolean" },
              autoScrapeConfigured: { type: "boolean" },
              nextHourlyAt: { type: ["string", "null"] },
              appwriteSyncEnabled: { type: "boolean" },
              appwriteSyncConfigured: { type: "boolean" },
              appwriteNextSyncAt: { type: ["string", "null"] },
              appwriteSync: {
                type: "object",
                additionalProperties: false,
                properties: {
                  enabled: { type: "boolean" },
                  running: { type: "boolean" },
                  lastTrigger: { type: ["string", "null"] },
                  lastStartedAt: { type: ["string", "null"] },
                  lastFinishedAt: { type: ["string", "null"] },
                  lastError: { type: ["string", "null"] },
                  lastFetchedSnapshots: { type: "integer" },
                  lastImportedSnapshots: { type: "integer" },
                  lastImportedEntries: { type: "integer" },
                },
              },
              latestSnapshot: {
                type: ["object", "null"],
                nullable: true,
                additionalProperties: false,
                properties: {
                  snapshotId: { type: "string" },
                  createdAt: { type: "string" },
                  region: { type: "string" },
                  count: { type: "integer" },
                },
              },
              snapshotStatus: {
                type: "object",
                additionalProperties: false,
                properties: {
                  running: { type: "boolean" },
                  lastTrigger: { type: ["string", "null"] },
                  lastStartedAt: { type: ["string", "null"] },
                  lastFinishedAt: { type: ["string", "null"] },
                  lastExitCode: { type: ["integer", "null"] },
                  lastError: { type: ["string", "null"] },
                },
              },
              maintenance: {
                type: "object",
                additionalProperties: false,
                properties: {
                  running: { type: "boolean" },
                  lastRunAt: { type: ["string", "null"] },
                  lastRunReason: { type: ["string", "null"] },
                  lastRetentionDeletedSnapshots: { type: "integer" },
                  lastRetentionDeletedEntries: { type: "integer" },
                  lastVacuumAt: { type: ["string", "null"] },
                  lastError: { type: ["string", "null"] },
                  retentionDays: { type: "integer" },
                  autoVacuumEnabled: { type: "boolean" },
                  vacuumMinHours: { type: "integer" },
                },
              },
              cacheWarm: {
                type: "object",
                additionalProperties: false,
                properties: {
                  running: { type: "boolean" },
                  lastReason: { type: ["string", "null"] },
                  lastStartedAt: { type: ["string", "null"] },
                  lastFinishedAt: { type: ["string", "null"] },
                  lastError: { type: ["string", "null"] },
                },
              },
              totals: {
                type: "object",
                additionalProperties: false,
                properties: {
                  snapshots: { type: "integer" },
                  entries: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
    async () =>
      withApiCache("health", {}, 15_000, async () => ({
        processStartedAt: processStartedAtIso,
        uptimeSeconds: Math.floor(process.uptime()),
        autoScrapeEnabled: AUTO_SCRAPE_EFFECTIVE,
        autoScrapeConfigured: AUTO_SCRAPE_ENABLED,
        nextHourlyAt: nextHourlyAtIso,
        appwriteSyncEnabled: APPWRITE_SYNC_ENABLED,
        appwriteSyncConfigured: APPWRITE_SYNC_ENABLED && !getAppwriteSyncConfigError(),
        appwriteNextSyncAt: nextAppwriteSyncAtIso,
        appwriteSync: appwriteSyncStatus,
        latestSnapshot: getLatestSnapshotMeta(),
        snapshotStatus,
        maintenance: getMaintenanceHealth(),
        cacheWarm: cacheWarmStatus,
        totals: {
          snapshots: Number(db.prepare("SELECT COUNT(*) AS c FROM snapshots").get().c || 0),
          entries: Number(db.prepare("SELECT COUNT(*) AS c FROM snapshot_entries").get().c || 0),
        },
      }))
  );

  fastify.get(
    "/api/leaderboard/delta",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            metric: { type: "string", enum: ["weeklyKills", "totalKills"], default: "weeklyKills" },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
          },
        },
      },
    },
    async (request) => {
      const top = request.query.top || 50;
      const metric = request.query.metric || "weeklyKills";
      const scope = request.query.scope || "week";
      return withApiCache("delta", { top, metric, scope }, 60_000, async () =>
        getDeltaLeaderboard({ top, metric, scope })
      );
    }
  );

  fastify.get(
    "/api/anomalies",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            minDeltaAbs: { type: "integer", minimum: 1, maximum: 5000, default: 80 },
            lookbackHours: { type: "integer", minimum: 12, maximum: 720, default: 72 },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
          },
        },
      },
    },
    async (request) => {
      const top = request.query.top || 20;
      const minDeltaAbs = request.query.minDeltaAbs || 80;
      const lookbackHours = request.query.lookbackHours || 72;
      const scope = request.query.scope || "week";
      return withApiCache("anomalies", { top, minDeltaAbs, lookbackHours, scope }, 60_000, async () =>
        getAnomalies({ top, minDeltaAbs, lookbackHours, scope })
      );
    }
  );

  fastify.get(
    "/api/reset-impact",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            windowHours: { type: "integer", minimum: 1, maximum: 24, default: 3 },
          },
        },
      },
    },
    async (request) => {
      const top = request.query.top || 20;
      const windowHours = request.query.windowHours || 3;
      return withApiCache("reset-impact", { top, windowHours }, 60_000, async () =>
        getResetImpact({ top, windowHours })
      );
    }
  );

  fastify.get(
    "/api/consistency",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
            days: { type: "integer", minimum: 1, maximum: 3650 },
          },
        },
      },
    },
    async (request) => {
      const top = request.query.top || 20;
      const scope = request.query.scope || "week";
      const days = request.query.days;
      return withApiCache("consistency", { top, scope, days: days || null }, 60_000, async () =>
        getConsistencyScores({ top, scope, days })
      );
    }
  );

  fastify.get(
    "/api/watchlist",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            accounts: { type: "string", maxLength: 1000, default: "" },
            minGain: { type: "integer", minimum: 0, maximum: 5000, default: 30 },
            minRankUp: { type: "integer", minimum: 0, maximum: 200, default: 3 },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
          },
        },
      },
    },
    async (request) => {
      const accounts = parseAccountsParam(request.query.accounts || "");
      const minGain = request.query.minGain || 30;
      const minRankUp = request.query.minRankUp || 3;
      const scope = request.query.scope || "week";
      return withApiCache(
        "watchlist",
        { accounts, minGain, minRankUp, scope },
        30_000,
        async () => getWatchlistAlerts({ accounts, minGain, minRankUp, scope })
      );
    }
  );

  fastify.get(
    "/api/report/weekly",
    async () =>
      withApiCache("weekly-report", {}, 60_000, async () => {
        const scope = "week";
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
      })
  );

  fastify.post(
    "/api/share/discord",
    {
      preHandler: requireTrustedLocalWrite,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["webhookUrl", "filename", "html"],
          properties: {
            webhookUrl: { type: "string", minLength: 1, maxLength: 500 },
            filename: { type: "string", minLength: 1, maxLength: 120 },
            html: { type: "string", minLength: 1, maxLength: 900000 },
            content: { type: "string", maxLength: 500 },
          },
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              ok: { type: "boolean" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const webhookUrl = String(request.body?.webhookUrl || "").trim();
      const filename = String(request.body?.filename || "snapshot.html").trim();
      const html = String(request.body?.html || "");
      const content = String(request.body?.content || "").trim();
      const webhookMasked = maskDiscordWebhookUrl(webhookUrl);

      if (!isValidDiscordWebhookUrl(webhookUrl)) {
        request.log.warn(
          { route: "/api/share/discord", requestId: request.id, webhook: webhookMasked },
          "Rejected invalid Discord webhook URL"
        );
        return reply.code(400).send({ error: "Invalid Discord webhook URL." });
      }
      if (!html) return reply.code(400).send({ error: "Missing HTML payload." });

      request.log.info(
        {
          route: "/api/share/discord",
          requestId: request.id,
          webhook: webhookMasked,
          filename,
          htmlBytes: Buffer.byteLength(html, "utf8"),
          hasContent: Boolean(content),
        },
        "Starting Discord snapshot upload"
      );

      const form = new FormData();
      form.append("file", new Blob([html], { type: "text/html;charset=utf-8;" }), filename);
      if (content) form.append("content", content);

      const discordRes = await fetch(webhookUrl, {
        method: "POST",
        body: form,
      });
      if (!discordRes.ok) {
        const errorText = await discordRes.text().catch(() => "");
        request.log.warn(
          {
            route: "/api/share/discord",
            requestId: request.id,
            webhook: webhookMasked,
            status: discordRes.status,
            errorPreview: errorText.slice(0, 180),
          },
          "Discord snapshot upload failed"
        );
        return reply.code(502).send({
          error: `Discord webhook upload failed (${discordRes.status})${errorText ? `: ${errorText.slice(0, 180)}` : ""}`,
        });
      }
      request.log.info(
        { route: "/api/share/discord", requestId: request.id, webhook: webhookMasked },
        "Discord snapshot upload succeeded"
      );
      return { ok: true };
    }
  );

  fastify.post(
    "/api/share/discord/test",
    {
      preHandler: requireTrustedLocalWrite,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["webhookUrl"],
          properties: {
            webhookUrl: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              ok: { type: "boolean" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const webhookUrl = String(request.body?.webhookUrl || "").trim();
      const webhookMasked = maskDiscordWebhookUrl(webhookUrl);
      if (!isValidDiscordWebhookUrl(webhookUrl)) {
        request.log.warn(
          { route: "/api/share/discord/test", requestId: request.id, webhook: webhookMasked },
          "Rejected invalid Discord webhook URL for test"
        );
        return reply.code(400).send({ error: "Invalid Discord webhook URL." });
      }
      request.log.info(
        { route: "/api/share/discord/test", requestId: request.id, webhook: webhookMasked },
        "Starting Discord webhook test message"
      );
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `Vox webhook test OK (${new Date().toISOString()})`,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        request.log.warn(
          {
            route: "/api/share/discord/test",
            requestId: request.id,
            webhook: webhookMasked,
            status: response.status,
            errorPreview: errorText.slice(0, 180),
          },
          "Discord webhook test failed"
        );
        return reply.code(502).send({
          error: `Discord webhook test failed (${response.status})${errorText ? `: ${errorText.slice(0, 180)}` : ""}`,
        });
      }
      request.log.info(
        { route: "/api/share/discord/test", requestId: request.id, webhook: webhookMasked },
        "Discord webhook test succeeded"
      );
      return { ok: true };
    }
  );

  fastify.post(
    "/api/maintenance/run",
    {
      preHandler: requireTrustedLocalWrite,
    },
    async (_request, reply) => {
      try {
        return await runMaintenance("manual-api");
      } catch {
        return reply.code(500).send({ error: "Maintenance failed" });
      }
    }
  );

  fastify.post(
    "/api/sync/run",
    {
      preHandler: requireTrustedLocalWrite,
    },
    async (_request, reply) => {
      if (!APPWRITE_SYNC_ENABLED) {
        return reply.code(409).send({
          error: "Appwrite sync is disabled (APPWRITE_SYNC_ENABLED=0).",
          status: appwriteSyncStatus,
        });
      }
      if (appwriteSyncStatus.running) {
        return reply.code(409).send({ error: "Appwrite sync already in progress", status: appwriteSyncStatus });
      }
      try {
        const result = await runAppwriteSyncAsync("manual-api");
        scheduleAppwriteSync();
        return { ok: true, result, status: appwriteSyncStatus };
      } catch (error) {
        fastify.log.error(`[api/sync/run] Failed: ${error?.message || "unknown_error"}`);
        return reply.code(500).send({ error: "Appwrite sync failed", status: appwriteSyncStatus });
      }
    }
  );

  fastify.post(
    "/api/snapshot/run",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              ok: { type: "boolean" },
              status: {
                type: "object",
                additionalProperties: false,
                properties: {
                  running: { type: "boolean" },
                  lastTrigger: { type: ["string", "null"] },
                  lastStartedAt: { type: ["string", "null"] },
                  lastFinishedAt: { type: ["string", "null"] },
                  lastExitCode: { type: ["integer", "null"] },
                  lastError: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
      preHandler: requireTrustedLocalWrite,
    },
    async (_request, reply) => {
      if (APPWRITE_SYNC_ENABLED) {
        return reply.code(409).send({
          error:
            "Manual local snapshot disabled while Appwrite sync is enabled.",
          status: snapshotStatus,
        });
      }
      if (snapshotStatus.running) {
        return reply.code(409).send({ error: "Snapshot already in progress", status: snapshotStatus });
      }
      try {
        await runSnapshotAsync("manual");
        return { ok: true, status: snapshotStatus };
      } catch (error) {
        fastify.log.error(`[api/snapshot/run] Failed: ${error?.message || "unknown_error"}`);
        return reply.code(500).send({ error: "Snapshot failed", status: snapshotStatus });
      }
    }
  );

  fastify.get(
    "/api/latest",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 300, default: 100 },
          },
        },
      },
    },
    async (request) => {
      const top = request.query.top || 100;
      return withApiCache("latest", { top }, 45_000, async () => {
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
      });
    }
  );

  fastify.get(
    "/api/progression/top",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 30, default: 10 },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
            days: { type: "integer", minimum: 1, maximum: 3650 },
          },
        },
      },
    },
    async (request) => {
      const top = request.query.top || 10;
      const scope = request.query.scope || "week";
      const days = request.query.days;
      return withApiCache("progression", { top, scope, days: days || null }, 60_000, async () =>
        getTopProgression(top, scope, days)
      );
    }
  );

  fastify.get(
    "/api/player/:account/history",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["account"],
          properties: {
            account: { type: "string", minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    async (request, reply) => {
      const accountName = sanitizeAccountName(request.params.account);
      if (!accountName) return reply.code(400).send({ error: "Invalid accountName" });
      return { accountName, history: qHistory.all(accountName) };
    }
  );

  fastify.get(
    "/api/compare",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            accounts: { type: "string", maxLength: 1000, default: "" },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
            days: { type: "integer", minimum: 1, maximum: 3650 },
          },
        },
      },
    },
    async (request) => {
      const accounts = parseAccountsParam(request.query.accounts || "");
      const scope = request.query.scope || "week";
      const days = request.query.days;
      const hasDaysFilter = scope === "all" && Number.isFinite(Number(days)) && Number(days) > 0;
      const cutoffIso = hasDaysFilter
        ? new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
        : null;
      return withApiCache("compare", { accounts, scope, days: hasDaysFilter ? Number(days) : null }, 60_000, async () => {
        const weekWindow = getCurrentWeekWindowBrussels();
        const series = getCompareSeries(accounts, scope, hasDaysFilter, cutoffIso, weekWindow);
        return {
          accounts,
          series,
          scope,
          days: hasDaysFilter ? Number(days) : null,
          weekWindow: scope === "week" ? weekWindow : null,
        };
      });
    }
  );

  fastify.get(
    "/api/accounts",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string", maxLength: 80, default: "" },
            limit: { type: "integer", minimum: 1, maximum: 30, default: 10 },
          },
        },
      },
    },
    async (request) => {
      const query = String(request.query.query || "").trim();
      const limit = request.query.limit || 10;
      return withApiCache("accounts", { query, limit }, 45_000, async () => {
        const rows = qAccountSearch.all(`%${query}%`, limit);
        return { accounts: rows.map((r) => r.account_name) };
      });
    }
  );

  fastify.post(
    "/api/guild-search/run",
    {
      preHandler: requireTrustedLocalWrite,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1, maxLength: 120 },
            region: { type: "string", enum: ["eu", "na"], default: "eu" },
            maxPages: { type: "integer", minimum: 1, maximum: GUILD_SEARCH_MAX_PAGES, default: GUILD_SEARCH_MAX_PAGES },
            perPage: { type: "integer", minimum: 10, maximum: GUILD_SEARCH_MAX_PER_PAGE, default: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const query = String(request.body?.query || "").trim();
      if (!query) return reply.code(400).send({ error: "Missing query." });
      const region = request.body?.region === "na" ? "na" : "eu";
      const maxPages = Math.max(
        1,
        Math.min(GUILD_SEARCH_MAX_PAGES, Number(request.body?.maxPages || GUILD_SEARCH_MAX_PAGES))
      );
      const perPage = Math.max(10, Math.min(GUILD_SEARCH_MAX_PER_PAGE, Number(request.body?.perPage || 100)));
      const job = createGuildSearchJob({ query, region, maxPages, perPage });
      request.log.info(
        { route: "/api/guild-search/run", requestId: request.id, jobId: job.id, query, region, maxPages, perPage },
        "Started guild search job"
      );
      return { ok: true, jobId: job.id };
    }
  );

  fastify.get(
    "/api/guild-search/:jobId",
    {
      preHandler: requireTrustedLocalRead,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["jobId"],
          properties: {
            jobId: { type: "string", minLength: 1, maxLength: 80 },
          },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, maximum: 100000, default: 1 },
            pageSize: { type: "integer", minimum: 10, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      cleanupGuildSearchJobs();
      const jobId = String(request.params.jobId || "").trim();
      const page = Math.max(1, Number(request.query.page || 1));
      const pageSize = Math.max(10, Math.min(200, Number(request.query.pageSize || 50)));
      const job = guildSearchJobs.get(jobId);
      if (!job) return reply.code(404).send({ error: "Guild search job not found." });

      const totalRows = job.rows.length;
      const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * pageSize;
      const rows = job.rows.slice(start, start + pageSize);
      return {
        jobId: job.id,
        query: job.query,
        region: job.region,
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        error: job.error,
        pagesFetched: job.pagesFetched,
        pagesTotal: job.pagesTotal,
        maxPages: job.maxPages,
        perPage: job.perPage,
        totalAvailable: job.totalAvailable,
        resultCount: job.resultCount,
        pagination: {
          page: safePage,
          pageSize,
          totalRows,
          totalPages,
          startIndex: totalRows ? start + 1 : 0,
          endIndex: totalRows ? Math.min(start + pageSize, totalRows) : 0,
        },
        rows,
      };
    }
  );

  if (HAS_DIST) {
    await fastify.register(fastifyStatic, { root: DIST_DIR, wildcard: false });
    fastify.get("/*", async (request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  } else if (IS_PROD) {
    fastify.log.warn("dist/ not found. Run `npm run build` before starting production server.");
    fastify.get("/", async (_request, reply) => {
      reply.code(503).type("text/html; charset=utf-8");
      return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VoxOfTheMists</title>
  </head>
  <body style="font-family: Arial, sans-serif; margin: 2rem;">
    <h1>Frontend build is missing</h1>
    <p>Run <code>npm run build</code> and restart the server.</p>
    <p>API endpoints remain available under <code>/api/*</code>.</p>
  </body>
</html>`;
    });
    fastify.get("/*", async (request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.redirect("/");
    });
  }
}

async function main() {
  await buildServer();
  await runMaintenance("startup").catch(() => { });
  await fastify.listen({ host: HOST, port: PORT });
  fastify.log.info(`API running on http://${HOST}:${PORT}`);
  if (APPWRITE_SYNC_ENABLED) {
    const cfgErr = getAppwriteSyncConfigError();
    if (cfgErr) {
      fastify.log.error(`[appwrite-sync] ${cfgErr}`);
      appwriteSyncStatus.lastError = cfgErr;
    } else {
      fastify.log.info(
        APPWRITE_SYNC_HOURLY_ALIGNED
          ? `[appwrite-sync] Enabled (hourly aligned at :${String(APPWRITE_SYNC_TARGET_MINUTE).padStart(2, "0")} UTC). Initial sync starting...`
          : `[appwrite-sync] Enabled (every ${APPWRITE_SYNC_INTERVAL_MINUTES}m). Initial sync starting...`
      );
      runAppwriteSyncAsync("startup")
        .then((res) => {
          fastify.log.info(
            `[appwrite-sync] Startup sync done fetched=${res.fetched} importedSnapshots=${res.importedSnapshots} importedEntries=${res.importedEntries}`
          );
        })
        .catch((err) => {
          fastify.log.error(`[appwrite-sync] Startup sync failed: ${err.message}`);
        })
        .finally(() => {
          scheduleAppwriteSync();
          scheduleAppwriteBackfill();
        });
    }
  }
  scheduleHourlyScrape();
}

function shutdown(signal) {
  clearTimeout(scrapeTimer);
  clearTimeout(appwriteSyncTimer);
  clearTimeout(appwriteBackfillTimer);
  fastify.log.info(`Received ${signal}, shutting down...`);
  fastify.close().finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
