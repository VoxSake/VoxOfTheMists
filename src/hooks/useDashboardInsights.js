import { useMemo } from "react";
import { fmtNumber, timeBucketFromLocalTime } from "../utils";

export function useDashboardInsights({
  filteredComparePayload,
  comparePayload,
  filteredEntries,
  deltaPayload,
  filteredDeltaRows,
  weeklyReport,
  nowMs,
  latestSnapshot,
  healthPayload,
  timeZone,
  watchlistSort,
  isVisibleAccount,
  velocityTopMover,
  velocityTotalWeeklyDelta,
}) {
  const compareSummaries = useMemo(() => {
    if (!filteredComparePayload?.series) return [];
    const accounts = Object.keys(filteredComparePayload.series);
    const dayOrder = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
    return accounts.map((account) => {
      const points = [...(filteredComparePayload.series[account] || [])].sort((a, b) =>
        String(a.createdAt).localeCompare(String(b.createdAt))
      );
      if (points.length < 2) {
        const emptyHoursByDay = Object.fromEntries(dayOrder.map((d) => [d, 0]));
        return {
          account,
          dominant: "Not enough data",
          confidence: 0,
          deltas: { Night: 0, Morning: 0, Afternoon: 0, Primetime: 0, Evening: 0 },
          hoursByDay: emptyHoursByDay,
        };
      }

      const deltas = { Night: 0, Morning: 0, Afternoon: 0, Primetime: 0, Evening: 0 };
      const hoursByDay = Object.fromEntries(dayOrder.map((d) => [d, 0]));
      const localPartsFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        weekday: "long",
      });
      for (let i = 1; i < points.length; i += 1) {
        const prev = Number(points[i - 1].weeklyKills || 0);
        const cur = Number(points[i].weeklyKills || 0);
        const delta = Math.max(0, cur - prev);
        if (delta <= 0) continue;
        const startMs = Date.parse(points[i - 1].createdAt);
        const endMs = Date.parse(points[i].createdAt);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          const fallbackParts = localPartsFormatter.formatToParts(new Date(points[i].createdAt));
          const fallbackHour = Number(fallbackParts.find((p) => p.type === "hour")?.value || "0");
          const fallbackMinute = Number(fallbackParts.find((p) => p.type === "minute")?.value || "0");
          const fallbackWeekday = String(fallbackParts.find((p) => p.type === "weekday")?.value || "");
          const fallbackBucket = timeBucketFromLocalTime(fallbackHour, fallbackMinute);
          deltas[fallbackBucket] += delta;
          if (Object.hasOwn(hoursByDay, fallbackWeekday)) hoursByDay[fallbackWeekday] += 1;
          continue;
        }

        const midMs = startMs + Math.floor((endMs - startMs) / 2);
        const parts = localPartsFormatter.formatToParts(new Date(midMs));
        const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
        const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");
        const weekday = String(parts.find((p) => p.type === "weekday")?.value || "");
        const bucket = timeBucketFromLocalTime(hour, minute);
        deltas[bucket] += delta;

        const durationMinutes = Math.max(1, Math.floor((endMs - startMs) / 60000));
        const creditedHours = Math.min(60, durationMinutes) / 60;
        if (Object.hasOwn(hoursByDay, weekday)) {
          hoursByDay[weekday] += creditedHours;
        }
      }

      for (const day of dayOrder) {
        hoursByDay[day] = Math.round(hoursByDay[day] || 0);
      }

      const total = Object.values(deltas).reduce((a, b) => a + b, 0);
      const sorted = Object.entries(deltas).sort((a, b) => b[1] - a[1]);
      const [dominant, dominantValue] = sorted[0];
      const confidence = total > 0 ? Math.round((dominantValue / total) * 100) : 0;
      return { account, dominant: total > 0 ? dominant : "No increase detected", confidence, deltas, hoursByDay };
    });
  }, [filteredComparePayload, timeZone]);

  const compareProjectionShare = useMemo(() => {
    if (!comparePayload?.weekWindow?.endUtc) return { leader: null, rows: [] };
    if (!filteredComparePayload?.series) return { leader: null, rows: [] };
    const endMs = Date.parse(comparePayload.weekWindow.endUtc);
    if (!Number.isFinite(endMs)) return { leader: null, rows: [] };

    const rows = [];
    for (const [account, points] of Object.entries(filteredComparePayload.series)) {
      const ordered = [...(points || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      if (ordered.length < 2) continue;
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      const firstMs = Date.parse(first.createdAt);
      const lastMs = Date.parse(last.createdAt);
      const firstWeekly = Number(first?.weeklyKills || 0);
      const lastWeekly = Number(last?.weeklyKills || 0);
      if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs) || lastMs <= firstMs) continue;
      if (!Number.isFinite(firstWeekly) || !Number.isFinite(lastWeekly)) continue;

      const elapsedHours = Math.max(0, (lastMs - firstMs) / 3600000);
      const weeklyGain = Math.max(0, lastWeekly - firstWeekly);
      const avgPerHour = elapsedHours > 0 ? weeklyGain / elapsedHours : 0;
      const remainingHours = Math.max(0, (endMs - lastMs) / 3600000);
      const projectedGain = avgPerHour * remainingHours;
      const projectedWeekly = lastWeekly + projectedGain;

      rows.push({
        account,
        avgPerHour,
        weeklyGain,
        projectedGain,
        projectedWeekly,
      });
    }

    const sortedRows = rows.sort((a, b) => b.projectedWeekly - a.projectedWeekly);
    return { leader: sortedRows[0] || null, rows: sortedRows };
  }, [comparePayload, filteredComparePayload]);

  const leaderboardProjectionLeader = useMemo(() => {
    const latestCreatedAt = String(deltaPayload?.latest?.createdAt || "").trim();
    const previousCreatedAt = String(deltaPayload?.previous?.createdAt || "").trim();
    const endUtc = String(deltaPayload?.weekWindow?.endUtc || "").trim();
    if (!latestCreatedAt || !previousCreatedAt || !endUtc) return null;

    const latestMs = Date.parse(latestCreatedAt);
    const previousMs = Date.parse(previousCreatedAt);
    const endMs = Date.parse(endUtc);
    if (!Number.isFinite(latestMs) || !Number.isFinite(previousMs) || !Number.isFinite(endMs) || latestMs <= previousMs) {
      return null;
    }

    const elapsedHours = Math.max(0.01, (latestMs - previousMs) / 3600000);
    const remainingHours = Math.max(0, (endMs - latestMs) / 3600000);
    const deltaByAccount = new Map(
      (filteredDeltaRows || []).map((row) => [String(row.accountName || "").toLowerCase(), Number(row.weeklyKillsDelta || 0)])
    );

    let leader = null;
    for (const row of filteredEntries || []) {
      const accountName = String(row?.accountName || "").trim();
      if (!accountName) continue;
      const weeklyKills = Number(row?.weeklyKills || 0);
      const intervalDelta = Math.max(0, Number(deltaByAccount.get(accountName.toLowerCase()) || 0));
      const projectedWeekly = weeklyKills + (intervalDelta / elapsedHours) * remainingHours;
      if (!leader || projectedWeekly > leader.projectedWeekly) {
        leader = {
          accountName,
          weeklyKills,
          intervalDelta,
          projectedWeekly,
        };
      }
    }
    return leader;
  }, [filteredEntries, filteredDeltaRows, deltaPayload]);

  const movers = useMemo(() => {
    if (!filteredDeltaRows.length) return { climbers: [], decliners: [] };
    const byRankGain = [...filteredDeltaRows]
      .filter((r) => Number.isFinite(Number(r.rankChange)))
      .sort((a, b) => Number(b.rankChange) - Number(a.rankChange));
    const byRankLoss = [...filteredDeltaRows]
      .filter((r) => Number.isFinite(Number(r.rankChange)))
      .sort((a, b) => Number(a.rankChange) - Number(b.rankChange));
    return {
      climbers: byRankGain.slice(0, 3),
      decliners: byRankLoss.slice(0, 3),
    };
  }, [filteredDeltaRows]);

  const weekReset = useMemo(() => {
    const endIso = weeklyReport?.delta?.weekWindow?.endUtc || null;
    if (!endIso) return { endIso: null, countdown: "-" };
    const endMs = Date.parse(endIso);
    if (!Number.isFinite(endMs)) return { endIso, countdown: "-" };
    const diffSec = Math.max(0, Math.floor((endMs - nowMs) / 1000));
    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const seconds = diffSec % 60;
    const countdown =
      diffSec === 0
        ? "Reset window reached"
        : `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(
            seconds
          ).padStart(2, "0")}s`;
    return { endIso, countdown };
  }, [weeklyReport, nowMs]);

  const dataQualityChecks = useMemo(() => {
    const latestMs = latestSnapshot?.createdAt ? Date.parse(latestSnapshot.createdAt) : NaN;
    const ageMinutes = Number.isFinite(latestMs) ? Math.max(0, Math.floor((nowMs - latestMs) / 60000)) : null;
    const freshnessStatus = ageMinutes == null ? "warn" : ageMinutes <= 75 ? "ok" : ageMinutes <= 120 ? "warn" : "alert";
    const freshnessDetail =
      ageMinutes == null ? "No snapshot timestamp available." : `Latest snapshot is ${ageMinutes} minute(s) old.`;

    const pipelineError = healthPayload?.appwriteSyncEnabled
      ? healthPayload?.appwriteSync?.lastError || null
      : healthPayload?.snapshotStatus?.lastError || null;
    const pipelineStatus = pipelineError ? "alert" : "ok";
    const pipelineDetail = pipelineError ? `Pipeline error: ${pipelineError}` : "No ingestion errors reported.";

    const latestCount = Number(latestSnapshot?.count || 0);
    const coverageStatus = latestCount >= 280 ? "ok" : latestCount >= 220 ? "warn" : "alert";
    const coverageDetail = latestCount > 0 ? `Latest snapshot contains ${fmtNumber(latestCount)} row(s).` : "No row count available.";

    const maintenanceError = healthPayload?.maintenance?.lastError || null;
    const maintenanceStatus = maintenanceError ? "warn" : "ok";
    const maintenanceDetail = maintenanceError ? `Maintenance warning: ${maintenanceError}` : "Maintenance reports healthy state.";

    return [
      { id: "freshness", title: "Freshness", status: freshnessStatus, detail: freshnessDetail },
      { id: "pipeline", title: "Ingestion Pipeline", status: pipelineStatus, detail: pipelineDetail },
      { id: "coverage", title: "Snapshot Coverage", status: coverageStatus, detail: coverageDetail },
      { id: "maintenance", title: "Maintenance", status: maintenanceStatus, detail: maintenanceDetail },
    ];
  }, [healthPayload, latestSnapshot, nowMs]);

  const weeklyTopAnomaly = useMemo(() => {
    const rows = weeklyReport?.anomalies?.anomalies || [];
    if (!rows.length) return null;
    return rows.find((r) => isVisibleAccount(r.accountName)) || null;
  }, [weeklyReport, isVisibleAccount]);

  const narrativeInsights = useMemo(() => {
    const insights = [];

    if (leaderboardProjectionLeader) {
      insights.push({
        id: "projection-leader",
        title: "Projected Week Leader",
        body: `${leaderboardProjectionLeader.accountName} is projected around ${fmtNumber(
          leaderboardProjectionLeader.projectedWeekly
        )} weekly kills.`,
        note: "Projection uses leaderboard pace from the latest snapshot interval.",
      });
    }

    if (velocityTopMover) {
      insights.push({
        id: "velocity-top-mover",
        title: "Momentum",
        body: `${velocityTopMover.accountName} currently leads momentum with +${fmtNumber(
          velocityTopMover.weeklyKillsDelta
        )} weekly kills.`,
        note: `Aggregate velocity is ${velocityTotalWeeklyDelta > 0 ? "+" : ""}${fmtNumber(velocityTotalWeeklyDelta)} this week.`,
      });
    }

    const strongestClimber = movers?.climbers?.[0];
    if (strongestClimber && Number.isFinite(Number(strongestClimber.rankChange))) {
      insights.push({
        id: "rank-climber",
        title: "Largest Rank Climb",
        body: `${strongestClimber.accountName} climbed ${strongestClimber.rankChange > 0 ? "+" : ""}${fmtNumber(
          strongestClimber.rankChange
        )} positions since the previous snapshot.`,
      });
    }

    if (weeklyTopAnomaly) {
      insights.push({
        id: "top-anomaly",
        title: "Strongest Anomaly",
        body: `${weeklyTopAnomaly.accountName} shows a ${weeklyTopAnomaly.direction || "notable"} deviation of ${fmtNumber(
          weeklyTopAnomaly.deviation
        )} (${weeklyTopAnomaly.deviationPct || 0}%).`,
        note: "Based on latest delta vs rolling baseline.",
      });
    }

    const triggeredWatchlist = (watchlistSort?.sorted || []).filter((row) => Boolean(row?.triggered));
    if (triggeredWatchlist.length) {
      insights.push({
        id: "watchlist-triggers",
        title: "Watchlist Pressure",
        body: `${fmtNumber(triggeredWatchlist.length)} watchlist account(s) are currently triggered.`,
        note: triggeredWatchlist
          .slice(0, 3)
          .map((row) => String(row.accountName || row.requestedAccount || "").trim())
          .filter(Boolean)
          .join(" | "),
      });
    }

    return insights.slice(0, 6);
  }, [
    compareProjectionShare,
    leaderboardProjectionLeader,
    velocityTopMover,
    velocityTotalWeeklyDelta,
    movers,
    weeklyTopAnomaly,
    watchlistSort,
  ]);

  return {
    compareSummaries,
    compareProjectionShare,
    leaderboardProjectionLeader,
    movers,
    weekReset,
    dataQualityChecks,
    narrativeInsights,
  };
}
