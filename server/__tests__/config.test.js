const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConfig } = require("../config");

test("buildConfig applies defaults and clamps ranges", () => {
  const cfg = buildConfig({});
  assert.equal(cfg.NODE_ENV, "production");
  assert.equal(cfg.PORT, 3000);
  assert.equal(cfg.AUTO_SCRAPE_ENABLED, true);
  assert.equal(cfg.APPWRITE_SYNC_ENABLED, false);
  assert.equal(cfg.APPWRITE_SYNC_INTERVAL_MINUTES, 60);
  assert.equal(cfg.APPWRITE_SYNC_TARGET_MINUTE, 12);
  assert.equal(cfg.APPWRITE_SYNC_ENTRY_BATCH_SIZE, 20);
  assert.equal(cfg.APPWRITE_SYNC_STARTUP_MIN_STALE_MINUTES, 50);
  assert.equal(cfg.APPWRITE_BACKFILL_ENABLED, false);
  assert.equal(cfg.APPWRITE_BACKFILL_TARGET_MINUTE, 30);
  assert.equal(cfg.API_CACHE_MAX_ENTRIES, 1000);
  assert.equal(cfg.REMOTE_ADMIN_TRUSTED_ORIGIN_ENABLED, false);
  assert.equal(cfg.AUTO_SCRAPE_EFFECTIVE, true);
});

test("buildConfig respects overrides and clamps out-of-range values", () => {
  const cfg = buildConfig({
    PORT: "99999",
    AUTO_SCRAPE: "0",
    APPWRITE_SYNC_ENABLED: "1",
    APPWRITE_SYNC_INTERVAL_MINUTES: "-10",
    APPWRITE_SYNC_TARGET_MINUTE: "88",
    APPWRITE_SYNC_ENTRY_BATCH_SIZE: "300",
    APPWRITE_SYNC_STARTUP_MIN_STALE_MINUTES: "-5",
    APPWRITE_BACKFILL_ENABLED: "1",
    APPWRITE_BACKFILL_TARGET_MINUTE: "-2",
    API_CACHE_MAX_ENTRIES: "50",
    REMOTE_ADMIN_TRUSTED_ORIGIN_ENABLED: "1",
  });

  assert.equal(cfg.PORT, 65535);
  assert.equal(cfg.AUTO_SCRAPE_ENABLED, false);
  assert.equal(cfg.APPWRITE_SYNC_ENABLED, true);
  assert.equal(cfg.APPWRITE_SYNC_INTERVAL_MINUTES, 1);
  assert.equal(cfg.APPWRITE_SYNC_TARGET_MINUTE, 59);
  assert.equal(cfg.APPWRITE_SYNC_ENTRY_BATCH_SIZE, 50);
  assert.equal(cfg.APPWRITE_SYNC_STARTUP_MIN_STALE_MINUTES, 0);
  assert.equal(cfg.APPWRITE_BACKFILL_ENABLED, true);
  assert.equal(cfg.APPWRITE_BACKFILL_TARGET_MINUTE, 0);
  assert.equal(cfg.API_CACHE_MAX_ENTRIES, 100);
  assert.equal(cfg.REMOTE_ADMIN_TRUSTED_ORIGIN_ENABLED, true);
  assert.equal(cfg.AUTO_SCRAPE_EFFECTIVE, false);
});

test("buildConfig normalizes Appwrite endpoint and trusted origins", () => {
  const cfg = buildConfig({
    PORT: "4000",
    TRUSTED_LOCAL_ORIGINS: "http://localhost:9999/,http://127.0.0.1:4000/",
    APPWRITE_ENDPOINT: "https://cloud.appwrite.io////",
  });

  assert.equal(cfg.APPWRITE_ENDPOINT, "https://cloud.appwrite.io");
  assert.ok(cfg.TRUSTED_LOCAL_ORIGINS.has("http://127.0.0.1:4000"));
  assert.ok(cfg.TRUSTED_LOCAL_ORIGINS.has("http://localhost:4000"));
  assert.ok(cfg.TRUSTED_LOCAL_ORIGINS.has("http://localhost:9999"));
});
