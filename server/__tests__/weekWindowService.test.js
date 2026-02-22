const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { createWeekWindowService } = require("../weekWindowService");

function setupDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE snapshots (
      snapshot_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      source TEXT,
      region TEXT,
      pages INTEGER,
      per_page INTEGER,
      total_available INTEGER,
      count INTEGER
    );
    CREATE TABLE snapshot_entries (
      snapshot_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      account_name TEXT NOT NULL,
      weekly_kills INTEGER NOT NULL DEFAULT 0,
      total_kills INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (snapshot_id, rank)
    );
  `);
  return db;
}

test("listSelectableWeekWindows uses Friday 18:45 snapshot as weekEnd and 19:00 as endUtc", () => {
  const db = setupDb();
  db.prepare(
    "INSERT INTO snapshots (snapshot_id, created_at, region, count) VALUES (?, ?, 'eu', 300)"
  ).run("snap_2026_02_20_1845", "2026-02-20T17:45:00.000Z");

  const svc = createWeekWindowService(db);
  const weeks = svc.listSelectableWeekWindows();
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].weekEndUtc, "2026-02-20T17:45:00.000Z");
  assert.equal(weeks[0].endUtc, "2026-02-20T18:00:00.000Z");
  assert.equal(weeks[0].startUtc, "2026-02-13T18:00:00.000Z");
});

test("resolveWeekWindowForRequest keeps backward compatibility with legacy 19:00 weekEnd ids", () => {
  const db = setupDb();
  db.prepare(
    "INSERT INTO snapshots (snapshot_id, created_at, region, count) VALUES (?, ?, 'eu', 300)"
  ).run("snap_2026_02_20_1845", "2026-02-20T17:45:00.000Z");

  const svc = createWeekWindowService(db);
  const resolved = svc.resolveWeekWindowForRequest("2026-02-20T18:00:00.000Z");
  assert.ok(resolved);
  assert.equal(resolved.selectedWeekEndUtc, "2026-02-20T17:45:00.000Z");
  assert.equal(resolved.weekWindow.endUtc, "2026-02-20T18:00:00.000Z");
});
