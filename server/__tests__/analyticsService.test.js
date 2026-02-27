const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { createAnalyticsService } = require("../analyticsService");

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

function createService(db) {
  const qLatest = db.prepare(`
    SELECT s.snapshot_id, s.created_at, s.region, s.count
    FROM snapshots s
    WHERE EXISTS (
      SELECT 1
      FROM snapshot_entries e
      WHERE e.snapshot_id = s.snapshot_id
    )
    ORDER BY s.created_at DESC
    LIMIT 1
  `);
  return createAnalyticsService({
    db,
    getLatestSnapshotMeta: () => {
      const row = qLatest.get();
      if (!row) return null;
      return {
        snapshotId: row.snapshot_id,
        createdAt: row.created_at,
        region: row.region,
        count: row.count,
      };
    },
    getCurrentWeekWindowBrussels: () => ({
      startUtc: "2026-02-13T18:00:00.000Z",
      endUtc: "2026-02-20T18:00:00.000Z",
    }),
  });
}

test("getLatestSnapshotMetaInWindow picks latest snapshot with entries inside selected week window", () => {
  const db = setupDb();
  db.prepare("INSERT INTO snapshots (snapshot_id, created_at, region, count) VALUES (?, ?, 'eu', 300)").run(
    "w1",
    "2026-02-20T17:00:00.000Z"
  );
  db.prepare("INSERT INTO snapshots (snapshot_id, created_at, region, count) VALUES (?, ?, 'eu', 300)").run(
    "w2-no-entries",
    "2026-02-20T17:45:00.000Z"
  );
  db.prepare("INSERT INTO snapshots (snapshot_id, created_at, region, count) VALUES (?, ?, 'eu', 300)").run(
    "outside",
    "2026-02-20T18:30:00.000Z"
  );
  db.prepare(
    "INSERT INTO snapshot_entries (snapshot_id, rank, account_name, weekly_kills, total_kills) VALUES (?, 1, 'A.1234', 100, 1000)"
  ).run("w1");
  db.prepare(
    "INSERT INTO snapshot_entries (snapshot_id, rank, account_name, weekly_kills, total_kills) VALUES (?, 1, 'A.1234', 120, 1020)"
  ).run("outside");

  const svc = createService(db);
  const latest = svc.getLatestSnapshotMetaInWindow("2026-02-13T18:00:00.000Z", "2026-02-20T18:00:00.000Z");
  assert.ok(latest);
  assert.equal(latest.snapshotId, "w1");
  assert.equal(latest.createdAt, "2026-02-20T17:00:00.000Z");
});

test("getDeltaLeaderboard uses provided weekWindow and does not leak current-week latest snapshot", () => {
  const db = setupDb();
  db.prepare("INSERT INTO snapshots (snapshot_id, created_at, region, count) VALUES (?, ?, 'eu', 300)").run(
    "old-prev",
    "2026-02-20T16:00:00.000Z"
  );
  db.prepare("INSERT INTO snapshots (snapshot_id, created_at, region, count) VALUES (?, ?, 'eu', 300)").run(
    "old-latest",
    "2026-02-20T17:45:00.000Z"
  );
  db.prepare("INSERT INTO snapshots (snapshot_id, created_at, region, count) VALUES (?, ?, 'eu', 300)").run(
    "current-week",
    "2026-02-20T18:30:00.000Z"
  );

  db.prepare(
    "INSERT INTO snapshot_entries (snapshot_id, rank, account_name, weekly_kills, total_kills) VALUES (?, 1, 'A.1234', ?, ?)"
  ).run("old-prev", 100, 1000);
  db.prepare(
    "INSERT INTO snapshot_entries (snapshot_id, rank, account_name, weekly_kills, total_kills) VALUES (?, 1, 'A.1234', ?, ?)"
  ).run("old-latest", 150, 1050);
  db.prepare(
    "INSERT INTO snapshot_entries (snapshot_id, rank, account_name, weekly_kills, total_kills) VALUES (?, 1, 'A.1234', ?, ?)"
  ).run("current-week", 5, 2000);

  const svc = createService(db);
  const result = svc.getDeltaLeaderboard({
    top: 10,
    metric: "weeklyKills",
    scope: "week",
    weekWindow: {
      startUtc: "2026-02-13T18:00:00.000Z",
      endUtc: "2026-02-20T18:00:00.000Z",
    },
  });

  assert.equal(result.latest.snapshotId, "old-latest");
  assert.equal(result.previous.snapshotId, "old-prev");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].accountName, "A.1234");
  assert.equal(result.rows[0].weeklyKillsDelta, 50);
});
