const crypto = require("node:crypto");

function parseBool(value, defaultValue = false) {
  if (value == null || value === "") return Boolean(defaultValue);
  return String(value).trim() === "1";
}

function parseNumber(value, defaultValue, { min = null, max = null } = {}) {
  const num = Number(value);
  const base = Number.isFinite(num) ? num : defaultValue;
  if (!Number.isFinite(base)) return defaultValue;
  if (min != null && base < min) return min;
  if (max != null && base > max) return max;
  return base;
}

function normalizeEndpoint(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function toTrimmedString(value) {
  return String(value || "").trim();
}

function parseTrustedOrigins(value, port) {
  const defaultOrigins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ];
  const extraOrigins = String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return new Set([...defaultOrigins, ...extraOrigins].map((v) => String(v).replace(/\/+$/, "")));
}

function buildConfig(env) {
  const NODE_ENV = env.NODE_ENV || "production";
  const PORT = parseNumber(env.PORT, 3000, { min: 1, max: 65535 });
  const AUTO_SCRAPE_ENABLED = env.AUTO_SCRAPE !== "0";
  const RETENTION_DAYS = parseNumber(env.RETENTION_DAYS, 0, { min: 0 });
  const AUTO_VACUUM_ENABLED = env.AUTO_VACUUM !== "0";
  const VACUUM_MIN_HOURS = parseNumber(env.VACUUM_MIN_HOURS, 24, { min: 1 });
  const PYTHON_CMD = env.PYTHON_CMD || "python";

  const APPWRITE_SYNC_ENABLED = parseBool(env.APPWRITE_SYNC_ENABLED, false);
  const APPWRITE_ENDPOINT = normalizeEndpoint(env.APPWRITE_ENDPOINT);
  const APPWRITE_PROJECT_ID = toTrimmedString(env.APPWRITE_PROJECT_ID);
  const APPWRITE_API_KEY = toTrimmedString(env.APPWRITE_API_KEY);
  const APPWRITE_DATABASE_ID = toTrimmedString(env.APPWRITE_DATABASE_ID);
  const APPWRITE_SNAPSHOTS_COLLECTION_ID = toTrimmedString(env.APPWRITE_SNAPSHOTS_COLLECTION_ID);
  const APPWRITE_ENTRIES_COLLECTION_ID = toTrimmedString(env.APPWRITE_ENTRIES_COLLECTION_ID);
  const APPWRITE_SYNC_INTERVAL_MINUTES = parseNumber(env.APPWRITE_SYNC_INTERVAL_MINUTES, 60, { min: 1 });
  const APPWRITE_SYNC_HOURLY_ALIGNED = env.APPWRITE_SYNC_HOURLY_ALIGNED !== "0";
  const APPWRITE_SYNC_TARGET_MINUTE = parseNumber(env.APPWRITE_SYNC_TARGET_MINUTE, 12, { min: 0, max: 59 });
  const APPWRITE_SYNC_ENTRY_BATCH_SIZE = parseNumber(env.APPWRITE_SYNC_ENTRY_BATCH_SIZE, 20, { min: 1, max: 50 });
  const APPWRITE_SYNC_STARTUP_MIN_STALE_MINUTES = parseNumber(env.APPWRITE_SYNC_STARTUP_MIN_STALE_MINUTES, 50, {
    min: 0,
  });
  const APPWRITE_BACKFILL_ENABLED = parseBool(env.APPWRITE_BACKFILL_ENABLED, false);
  const APPWRITE_BACKFILL_TARGET_MINUTE = parseNumber(env.APPWRITE_BACKFILL_TARGET_MINUTE, 30, { min: 0, max: 59 });
  const APPWRITE_FUNCTION_ID = toTrimmedString(env.APPWRITE_FUNCTION_ID);

  const TRUSTED_LOCAL_ORIGINS = parseTrustedOrigins(env.TRUSTED_LOCAL_ORIGINS, PORT);
  const WRITE_API_TOKEN = toTrimmedString(env.WRITE_API_TOKEN || crypto.randomBytes(32).toString("hex"));
  const API_CACHE_MAX_ENTRIES = parseNumber(env.API_CACHE_MAX_ENTRIES, 1000, { min: 100 });

  const AUTO_SCRAPE_EFFECTIVE = AUTO_SCRAPE_ENABLED && !APPWRITE_SYNC_ENABLED;

  return {
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
  };
}

module.exports = {
  buildConfig,
};
