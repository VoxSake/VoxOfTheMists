function createAnalyticsService({ db, getLatestSnapshotMeta, getCurrentWeekWindowBrussels }) {
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

  function getTopProgression(top, scope = "week", days = null, weekWindow = null) {
    const effectiveWeekWindow = weekWindow || getCurrentWeekWindowBrussels();
    const hasDaysFilter = scope === "all" && Number.isFinite(Number(days)) && Number(days) > 0;
    const cutoffIso = hasDaysFilter
      ? new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const latest =
      scope === "week"
        ? getLatestSnapshotMetaInWindow(effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc)
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
        ...(scope === "week" ? [effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc] : []),
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
      weekWindow: scope === "week" ? effectiveWeekWindow : null,
    };
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

  function getDeltaLeaderboard({ top = 50, metric = "weeklyKills", scope = "week", weekWindow = null }) {
    const metricKey = metric === "totalKills" ? "total_kills" : "weekly_kills";
    const effectiveWeekWindow = weekWindow || getCurrentWeekWindowBrussels();
    const latest =
      scope === "week"
        ? getLatestSnapshotMetaInWindow(effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc)
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
        ? db.prepare(prevSql).get(latest.createdAt, effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc)
        : db.prepare(prevSql).get(latest.createdAt);
    if (!previous?.snapshot_id) {
      return {
        latest,
        previous: null,
        rows: [],
        scope,
        weekWindow: scope === "week" ? effectiveWeekWindow : null,
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
      .sort(
        (a, b) =>
          Number(b[metricKey === "total_kills" ? "totalKillsDelta" : "weeklyKillsDelta"]) -
          Number(a[metricKey === "total_kills" ? "totalKillsDelta" : "weeklyKillsDelta"])
      )
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
      weekWindow: scope === "week" ? effectiveWeekWindow : null,
    };
  }

  function getAnomalies({ top = 20, minDeltaAbs = 80, lookbackHours = 72, scope = "week", weekWindow = null }) {
    const effectiveWeekWindow = weekWindow || getCurrentWeekWindowBrussels();
    const latest =
      scope === "week"
        ? getLatestSnapshotMetaInWindow(effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc)
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
    if (!accounts.length) {
      return { latest, anomalies: [], scope, weekWindow: scope === "week" ? effectiveWeekWindow : null };
    }

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
        ...(scope === "week" ? [effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc] : [])
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
      weekWindow: scope === "week" ? effectiveWeekWindow : null,
    };
  }

  function getResetImpact({ top = 20, windowHours = 3, weekWindow = null }) {
    const effectiveWeekWindow = weekWindow || getCurrentWeekWindowBrussels();
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
      .get(effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc);
    if (!base?.snapshot_id) {
      return { weekWindow: effectiveWeekWindow, windowHours, base: null, target: null, rows: [] };
    }

    const cutoffMs = Math.min(
      Date.parse(effectiveWeekWindow.endUtc),
      Date.parse(effectiveWeekWindow.startUtc) + Math.max(1, Number(windowHours)) * 60 * 60 * 1000
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
      .get(effectiveWeekWindow.startUtc, cutoffIso);
    if (!target?.snapshot_id) {
      return {
        weekWindow: effectiveWeekWindow,
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
      weekWindow: effectiveWeekWindow,
      windowHours: Math.max(1, Number(windowHours)),
      base: { snapshotId: base.snapshot_id, createdAt: base.created_at, region: base.region, count: base.count },
      target: { snapshotId: target.snapshot_id, createdAt: target.created_at, region: target.region, count: target.count },
      rows,
    };
  }

  function getConsistencyScores({ top = 20, scope = "week", days = null, weekWindow = null }) {
    const effectiveWeekWindow = weekWindow || getCurrentWeekWindowBrussels();
    const hasDaysFilter = scope === "all" && Number.isFinite(Number(days)) && Number(days) > 0;
    const cutoffIso = hasDaysFilter
      ? new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const latest =
      scope === "week"
        ? getLatestSnapshotMetaInWindow(effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc)
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
        weekWindow: scope === "week" ? effectiveWeekWindow : null,
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
        ...(scope === "week" ? [effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc] : []),
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
      weekWindow: scope === "week" ? effectiveWeekWindow : null,
    };
  }

  function getWatchlistAlerts({ accounts = [], minGain = 30, minRankUp = 3, scope = "week", weekWindow = null }) {
    const effectiveWeekWindow = weekWindow || getCurrentWeekWindowBrussels();
    const latest =
      scope === "week"
        ? getLatestSnapshotMetaInWindow(effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc)
        : getLatestSnapshotMeta();
    if (!latest) return { latest: null, previous: null, scope, weekWindow: null, rows: [] };
    if (!accounts.length) {
      return { latest, previous: null, scope, weekWindow: scope === "week" ? effectiveWeekWindow : null, rows: [] };
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
        ? db.prepare(prevSql).get(latest.createdAt, effectiveWeekWindow.startUtc, effectiveWeekWindow.endUtc)
        : db.prepare(prevSql).get(latest.createdAt);
    if (!previous?.snapshot_id) {
      return {
        latest,
        previous: null,
        scope,
        weekWindow: scope === "week" ? effectiveWeekWindow : null,
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
      weekWindow: scope === "week" ? effectiveWeekWindow : null,
      minGain: Math.max(0, Number(minGain)),
      minRankUp: Math.max(0, Number(minRankUp)),
      rows,
    };
  }

  return {
    getLatestSnapshotMetaInWindow,
    getTopProgression,
    getCompareSeries,
    getDeltaLeaderboard,
    getAnomalies,
    getResetImpact,
    getConsistencyScores,
    getWatchlistAlerts,
  };
}

module.exports = {
  createAnalyticsService,
};
