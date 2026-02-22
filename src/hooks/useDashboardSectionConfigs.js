import { useMemo } from "react";
import { useDashboardCoreConfigs } from "./useDashboardCoreConfigs";
import { useDashboardFeatureConfigs } from "./useDashboardFeatureConfigs";

/** @typedef {import("../types/dashboard").DashboardMainProps} DashboardMainProps */

export function useDashboardSectionConfigs({
  initialLoading,
  latestSnapshot,
  healthPayload,
  timeZone,
  nextSnapshotIso,
  ingestionStatus,
  lastPipelineEventIso,
  snapshotCount,
  entriesPerSnapshot,
  weekReset,
  velocityTotalWeeklyDelta,
  velocityAvgPerHour,
  velocityTopMover,
  narrativeInsights,
  scope,
  metric,
  allTimeRange,
  themeDark,
  guildCheck,
  ...configInputs
}) {
  const { leaderboardConfig, moversConfig, anomaliesConfig } = useDashboardCoreConfigs(configInputs);

  const {
    weekCompareConfig,
    progressionConfig,
    compareConfig,
    watchlistConfig,
    profileConfig,
    resetImpactConfig,
    consistencyConfig,
  } = useDashboardFeatureConfigs(configInputs);

  /** @type {DashboardMainProps} */
  const dashboardMainProps = useMemo(
    () => ({
      initialLoading,
      latestSnapshot,
      healthPayload,
      timeZone,
      nextSnapshotIso,
      ingestionStatus,
      lastPipelineEventIso,
      snapshotCount,
      entriesPerSnapshot,
      weekReset,
      velocityTotalWeeklyDelta,
      velocityAvgPerHour,
      velocityTopMover,
      narrativeInsights,
      scope,
      metric,
      allTimeRange,
      themeDark,
      leaderboard: leaderboardConfig,
      movers: moversConfig,
      anomalies: anomaliesConfig,
      weekCompare: weekCompareConfig,
      progression: progressionConfig,
      compare: compareConfig,
      watchlist: watchlistConfig,
      profile: profileConfig,
      resetImpact: resetImpactConfig,
      consistency: consistencyConfig,
      guildCheck,
    }),
    [
      initialLoading,
      latestSnapshot,
      healthPayload,
      timeZone,
      nextSnapshotIso,
      ingestionStatus,
      lastPipelineEventIso,
      snapshotCount,
      entriesPerSnapshot,
      weekReset,
      velocityTotalWeeklyDelta,
      velocityAvgPerHour,
      velocityTopMover,
      narrativeInsights,
      scope,
      metric,
      allTimeRange,
      themeDark,
      leaderboardConfig,
      moversConfig,
      anomaliesConfig,
      weekCompareConfig,
      progressionConfig,
      compareConfig,
      watchlistConfig,
      profileConfig,
      resetImpactConfig,
      consistencyConfig,
      guildCheck,
    ]
  );

  return {
    dashboardMainProps,
  };
}
