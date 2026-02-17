import { useMemo } from "react";

export function useDashboardStats({
  healthPayload,
  latestSnapshot,
  nowMs,
  snapshotCount,
  filteredDeltaRows,
  deltaPayload,
}) {
  const nextSnapshotIso = healthPayload?.appwriteSyncEnabled
    ? healthPayload?.appwriteNextSyncAt || null
    : healthPayload?.nextHourlyAt || null;

  const latestSnapshotMs = latestSnapshot?.createdAt ? Date.parse(latestSnapshot.createdAt) : null;
  const latestSnapshotAgeMinutes =
    Number.isFinite(latestSnapshotMs) ? Math.max(0, Math.floor((nowMs - latestSnapshotMs) / 60000)) : null;
  const ingestionIsLate = latestSnapshotAgeMinutes != null && latestSnapshotAgeMinutes > 95;
  const ingestionStatus =
    latestSnapshotAgeMinutes == null ? "-" : ingestionIsLate ? `Late by ${latestSnapshotAgeMinutes}m` : "On time";

  const lastPipelineEventIso = healthPayload?.appwriteSyncEnabled
    ? healthPayload?.appwriteSync?.lastFinishedAt || null
    : healthPayload?.snapshotStatus?.lastFinishedAt || null;

  const entriesPerSnapshot =
    healthPayload?.totals?.entries != null && snapshotCount > 0
      ? Math.round(Number(healthPayload.totals.entries) / snapshotCount)
      : null;

  const velocityTotalWeeklyDelta = useMemo(
    () => filteredDeltaRows.reduce((sum, row) => sum + Number(row.weeklyKillsDelta || 0), 0),
    [filteredDeltaRows]
  );

  const velocityTopMover = useMemo(() => {
    if (!filteredDeltaRows.length) return null;
    return [...filteredDeltaRows].sort((a, b) => Number(b.weeklyKillsDelta || 0) - Number(a.weeklyKillsDelta || 0))[0];
  }, [filteredDeltaRows]);

  const velocityIntervalHours = useMemo(() => {
    const latestMs = deltaPayload?.latest?.createdAt ? Date.parse(deltaPayload.latest.createdAt) : NaN;
    const prevMs = deltaPayload?.previous?.createdAt ? Date.parse(deltaPayload.previous.createdAt) : NaN;
    if (!Number.isFinite(latestMs) || !Number.isFinite(prevMs) || latestMs <= prevMs) return null;
    return Math.max(0.01, (latestMs - prevMs) / 3600000);
  }, [deltaPayload]);

  const velocityAvgPerHour =
    velocityIntervalHours != null ? Math.round(velocityTotalWeeklyDelta / Math.max(0.01, velocityIntervalHours)) : null;

  return {
    nextSnapshotIso,
    ingestionStatus,
    lastPipelineEventIso,
    entriesPerSnapshot,
    velocityTotalWeeklyDelta,
    velocityAvgPerHour,
    velocityTopMover,
  };
}
