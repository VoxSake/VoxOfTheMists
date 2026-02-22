import { fmtNumber, formatTimestamp } from "../utils";

function maskAccountName(account) {
  const raw = String(account || "").trim();
  if (!raw) return raw;
  if (raw.toLowerCase().includes("anon")) return raw;
  if (raw.length <= 3) return `${raw}***`;
  return `${raw.slice(0, 3)}***`;
}

function accountForPreset(account, preset) {
  return preset === "public-safe" ? maskAccountName(account) : String(account || "");
}

function toOrderedNumericSeries(points = [], valueKey = "weeklyKills") {
  return [...(points || [])]
    .sort((a, b) => String(a?.createdAt || "").localeCompare(String(b?.createdAt || "")))
    .map((p) => ({
      createdAt: String(p?.createdAt || ""),
      value: Number(p?.[valueKey]),
    }))
    .filter((p) => p.createdAt && Number.isFinite(p.value));
}

function buildTopSeriesMap(seriesMap = {}, valueKey = "weeklyKills", maxSeries = 8) {
  const entries = Object.entries(seriesMap || {})
    .map(([account, points]) => {
      const ordered = toOrderedNumericSeries(points, valueKey);
      if (!ordered.length) return null;
      return {
        account: String(account || ""),
        points: ordered,
        latestValue: ordered[ordered.length - 1]?.value ?? Number.NEGATIVE_INFINITY,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.latestValue - a.latestValue)
    .slice(0, maxSeries);

  return entries.map((entry) => ({
    account: entry.account,
    points: entry.points,
  }));
}

function buildCompareSeriesWithProjection({ seriesMap = {}, projectionRows = [], weekEndIso = null, maxSeries = 8 } = {}) {
  const projectionByAccount = new Map(
    (projectionRows || []).map((row) => [String(row?.account || "").toLowerCase(), Number(row?.projectedWeekly)])
  );
  const weekEndMs = Date.parse(String(weekEndIso || ""));

  const base = buildTopSeriesMap(seriesMap, "weeklyKills", maxSeries);
  return base.map((entry) => {
    const points = [...entry.points];
    const projectionStartAt = points[points.length - 1]?.createdAt || null;
    const projectedWeekly = projectionByAccount.get(String(entry.account || "").toLowerCase());
    if (!projectionStartAt || !Number.isFinite(projectedWeekly) || !Number.isFinite(weekEndMs)) {
      return { ...entry };
    }
    const startMs = Date.parse(projectionStartAt);
    if (!Number.isFinite(startMs) || weekEndMs <= startMs) return { ...entry };
    points.push({
      createdAt: new Date(weekEndMs).toISOString(),
      value: projectedWeekly,
    });
    return {
      ...entry,
      points,
      projectionStartAt,
    };
  });
}

export function buildShareReportPayload({ shareData, timeZone, generatedAt, preset = "full" }) {
  const maxLeaderboardRows = preset === "public-safe" ? 80 : 300;
  const maxMoverRows = preset === "public-safe" ? 60 : 200;
  const maxAnomalyRows = preset === "public-safe" ? 40 : 100;

  return {
    generatedAt,
    timeZone,
    title: "Vox of the Mists - Shared Report",
    overview: {
      latestSnapshot: shareData.latestSnapshot
        ? `${formatTimestamp(shareData.latestSnapshot.createdAt, timeZone)} | Region: ${shareData.latestSnapshot.region}`
        : "-",
      nextSnapshot: formatTimestamp(shareData.nextSnapshotIso, timeZone),
      ingestionStatus: shareData.ingestionStatus,
      lastRun: shareData.lastPipelineEventIso ? formatTimestamp(shareData.lastPipelineEventIso, timeZone) : "-",
      storage: `${fmtNumber(shareData.snapshotCount)} snapshots | ${
        shareData.healthPayload?.totals?.entries != null ? fmtNumber(shareData.healthPayload.totals.entries) : "-"
      } entries | avg ${shareData.entriesPerSnapshot != null ? fmtNumber(shareData.entriesPerSnapshot) : "-"} / snapshot`,
      weekReset: `${shareData.weekReset.countdown} | Ends ${formatTimestamp(shareData.weekReset.endIso, timeZone)}`,
      velocity: `Total delta ${
        shareData.velocityTotalWeeklyDelta > 0 ? "+" : ""
      }${fmtNumber(shareData.velocityTotalWeeklyDelta)} | Avg/hour ${
        shareData.velocityAvgPerHour != null
          ? `${shareData.velocityAvgPerHour > 0 ? "+" : ""}${fmtNumber(shareData.velocityAvgPerHour)}`
          : "-"
      } | Top mover ${
        shareData.velocityTopMover
          ? `${accountForPreset(shareData.velocityTopMover.accountName, preset)} (+${fmtNumber(
            shareData.velocityTopMover.weeklyKillsDelta
          )})`
          : "-"
      }`,
      sharePreset: preset === "public-safe" ? "Public-safe (masked accounts, reduced detail)" : "Full detail",
    },
    leaderboard: shareData.leaderboardRows.slice(0, maxLeaderboardRows).map((r) => ({
      rank: r.rank,
      accountName: accountForPreset(r.accountName, preset),
      weeklyKills: fmtNumber(r.weeklyKills),
      totalKills: fmtNumber(r.totalKills),
    })),
    movers: shareData.moverRows.slice(0, maxMoverRows).map((r) => ({
      latestRank: r.latestRank,
      previousRank: r.previousRank,
      rankChange: r.rankChange == null ? "-" : `${r.rankChange > 0 ? "+" : ""}${r.rankChange}`,
      accountName: accountForPreset(r.accountName, preset),
      weeklyKillsDelta: `${Number(r.weeklyKillsDelta) > 0 ? "+" : ""}${fmtNumber(r.weeklyKillsDelta)}`,
      totalKillsDelta: `${Number(r.totalKillsDelta) > 0 ? "+" : ""}${fmtNumber(r.totalKillsDelta)}`,
    })),
    anomalies: shareData.anomalyRows.slice(0, maxAnomalyRows).map((r) => ({
      createdAt: formatTimestamp(r.createdAt, timeZone),
      accountName: accountForPreset(r.accountName, preset),
      direction: r.direction ? r.direction.charAt(0).toUpperCase() + r.direction.slice(1) : "-",
      latestDelta: `${Number(r.latestDelta) > 0 ? "+" : ""}${fmtNumber(r.latestDelta)}`,
      baselineAvg: fmtNumber(r.baselineAvg),
      deviation: `${Number(r.deviation) > 0 ? "+" : ""}${fmtNumber(r.deviation)}`,
      deviationPct: `${Number(r.deviationPct) > 0 ? "+" : ""}${r.deviationPct}`,
    })),
    resetImpact: shareData.resetImpactRows.map((r) => ({
      accountName: accountForPreset(r.accountName, preset),
      startRank: r.startRank,
      endRank: r.endRank,
      rankGain: `${Number(r.rankGain) > 0 ? "+" : ""}${r.rankGain}`,
      gain: `${Number(r.gain) > 0 ? "+" : ""}${fmtNumber(r.gain)}`,
      totalGain: `${Number(r.totalGain) > 0 ? "+" : ""}${fmtNumber(r.totalGain)}`,
    })),
    consistency: shareData.consistencyRows.map((r) => ({
      accountName: accountForPreset(r.accountName, preset),
      consistencyScore: r.consistencyScore,
      avgDelta: fmtNumber(r.avgDelta),
      stddevDelta: fmtNumber(r.stddevDelta),
      activeIntervals: fmtNumber(r.activeIntervals),
      totalGain: fmtNumber(r.totalGain),
    })),
    compareSummaries: shareData.compareSummaries.map((s) => {
      const projection = (shareData.compareProjectionShare?.rows || []).find((r) => r.account === s.account);
      const totalHours =
        Number(s.hoursByDay?.Friday || 0) +
        Number(s.hoursByDay?.Saturday || 0) +
        Number(s.hoursByDay?.Sunday || 0) +
        Number(s.hoursByDay?.Monday || 0) +
        Number(s.hoursByDay?.Tuesday || 0) +
        Number(s.hoursByDay?.Wednesday || 0) +
        Number(s.hoursByDay?.Thursday || 0);
      return {
        ...s,
        account: accountForPreset(s.account, preset),
        totalHours,
        avgKillsPerHour: projection?.avgPerHour ?? null,
        weeklyKillsGain: projection?.weeklyGain ?? null,
        projectedWeeklyGain: projection?.projectedGain ?? null,
        projectedWeeklyAtReset: projection?.projectedWeekly ?? null,
      };
    }),
    compareProjection: (shareData.compareProjectionShare?.rows || []).map((r) => ({
      account: accountForPreset(r.account, preset),
      avgKillsPerHour: fmtNumber(r.avgPerHour),
      weeklyKillsGain: fmtNumber(r.weeklyGain),
      projectedGain: fmtNumber(r.projectedGain),
      projectedWeeklyAtReset: fmtNumber(r.projectedWeekly),
    })),
    compareProjectionLeader: shareData.compareProjectionShare?.leader
      ? `${accountForPreset(shareData.compareProjectionShare.leader.account, preset)} (${fmtNumber(
        shareData.compareProjectionShare.leader.projectedWeekly
      )})`
      : "-",
    charts: {
      progressionWeekly: {
        title: "Top Progression (Weekly Kills)",
        series: buildTopSeriesMap(shareData.filteredProgressionPayload?.series || {}, "weeklyKills", 8).map((row) => ({
          ...row,
          account: accountForPreset(row.account, preset),
        })),
      },
      compareWeekly: {
        title: "Compare Accounts (Weekly Kills + Projection)",
        series: buildCompareSeriesWithProjection({
          seriesMap: shareData.filteredComparePayload?.series || {},
          projectionRows: shareData.compareProjectionShare?.rows || [],
          weekEndIso: shareData.compareWeekEndIso || null,
          maxSeries: 8,
        }).map((row) => ({
          ...row,
          account: accountForPreset(row.account, preset),
        })),
      },
      moversWeeklyDelta: {
        title: "Top Movers (Weekly Delta)",
        rows: [...(shareData.moverRows || [])]
          .filter((r) => Number.isFinite(Number(r?.weeklyKillsDelta)))
          .sort((a, b) => Number(b.weeklyKillsDelta || 0) - Number(a.weeklyKillsDelta || 0))
          .slice(0, 10)
          .map((r) => ({
            accountName: accountForPreset(r.accountName, preset),
            value: Number(r.weeklyKillsDelta || 0),
          })),
      },
    },
  };
}
