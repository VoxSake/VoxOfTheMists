import { useMemo } from "react";

export function useDashboardFeatureConfigs({
  compareWeekOptions,
  compareWeekA,
  compareWeekB,
  setCompareWeekA,
  setCompareWeekB,
  weekOptions,
  weekCompareState,
  weekCompareSummary,
  topProgression,
  setTopProgression,
  setMetric,
  setScope,
  setAllTimeRange,
  progressionPayload,
  filteredProgressionPayload,
  effectiveCompareAccounts,
  removeCompareAccount,
  compareInput,
  handleCompareInputChange,
  suggestions,
  addCompareAccount,
  setCompareBaseline,
  compareBaseline,
  comparePayload,
  filteredComparePayload,
  compareSummaries,
  effectiveWatchlistAccounts,
  removeWatchlistAccount,
  watchlistInput,
  handleWatchlistInputChange,
  watchlistSuggestions,
  addWatchlistAccount,
  watchlistMinGain,
  setWatchlistMinGain,
  watchlistMinRankUp,
  setWatchlistMinRankUp,
  watchlistSort,
  profileInput,
  handleProfileInputChange,
  profileSuggestions,
  handleSelectProfile,
  profileAccount,
  profileState,
  profileSummary,
  profileRows,
  resetImpactWindow,
  setResetImpactWindow,
  resetImpactPayload,
  resetImpactSort,
  consistencyTop,
  setConsistencyTop,
  consistencySort,
}) {
  const weekCompareConfig = useMemo(
    () => ({
      options: compareWeekOptions,
      weekA: compareWeekA,
      weekB: compareWeekB,
      setWeekA: setCompareWeekA,
      setWeekB: setCompareWeekB,
      hasArchivedWeeks: weekOptions.length > 0,
      state: weekCompareState,
      summary: weekCompareSummary,
    }),
    [
      compareWeekOptions,
      compareWeekA,
      compareWeekB,
      setCompareWeekA,
      setCompareWeekB,
      weekOptions.length,
      weekCompareState,
      weekCompareSummary,
    ]
  );

  const progressionConfig = useMemo(
    () => ({
      top: topProgression,
      setTop: setTopProgression,
      setMetric,
      setScope,
      setAllTimeRange,
      payload: progressionPayload,
      filteredPayload: filteredProgressionPayload,
    }),
    [
      topProgression,
      setTopProgression,
      setMetric,
      setScope,
      setAllTimeRange,
      progressionPayload,
      filteredProgressionPayload,
    ]
  );

  const compareConfig = useMemo(
    () => ({
      effectiveAccounts: effectiveCompareAccounts,
      removeAccount: removeCompareAccount,
      input: compareInput,
      handleInputChange: handleCompareInputChange,
      suggestions,
      addAccount: addCompareAccount,
      setBaseline: setCompareBaseline,
      baseline: compareBaseline,
      setAllTimeRange,
      payload: comparePayload,
      filteredPayload: filteredComparePayload,
      summaries: compareSummaries,
    }),
    [
      effectiveCompareAccounts,
      removeCompareAccount,
      compareInput,
      handleCompareInputChange,
      suggestions,
      addCompareAccount,
      setCompareBaseline,
      compareBaseline,
      setAllTimeRange,
      comparePayload,
      filteredComparePayload,
      compareSummaries,
    ]
  );

  const watchlistConfig = useMemo(
    () => ({
      effectiveAccounts: effectiveWatchlistAccounts,
      removeAccount: removeWatchlistAccount,
      input: watchlistInput,
      handleInputChange: handleWatchlistInputChange,
      suggestions: watchlistSuggestions,
      addAccount: addWatchlistAccount,
      minGain: watchlistMinGain,
      setMinGain: setWatchlistMinGain,
      minRankUp: watchlistMinRankUp,
      setMinRankUp: setWatchlistMinRankUp,
      sort: watchlistSort,
    }),
    [
      effectiveWatchlistAccounts,
      removeWatchlistAccount,
      watchlistInput,
      handleWatchlistInputChange,
      watchlistSuggestions,
      addWatchlistAccount,
      watchlistMinGain,
      setWatchlistMinGain,
      watchlistMinRankUp,
      setWatchlistMinRankUp,
      watchlistSort,
    ]
  );

  const profileConfig = useMemo(
    () => ({
      input: profileInput,
      handleInputChange: handleProfileInputChange,
      suggestions: profileSuggestions,
      handleSelect: handleSelectProfile,
      account: profileAccount,
      state: profileState,
      summary: profileSummary,
      rows: profileRows,
    }),
    [
      profileInput,
      handleProfileInputChange,
      profileSuggestions,
      handleSelectProfile,
      profileAccount,
      profileState,
      profileSummary,
      profileRows,
    ]
  );

  const resetImpactConfig = useMemo(
    () => ({
      window: resetImpactWindow,
      setWindow: setResetImpactWindow,
      payload: resetImpactPayload,
      sort: resetImpactSort,
    }),
    [resetImpactWindow, setResetImpactWindow, resetImpactPayload, resetImpactSort]
  );

  const consistencyConfig = useMemo(
    () => ({
      top: consistencyTop,
      setTop: setConsistencyTop,
      sort: consistencySort,
    }),
    [consistencyTop, setConsistencyTop, consistencySort]
  );

  return {
    weekCompareConfig,
    progressionConfig,
    compareConfig,
    watchlistConfig,
    profileConfig,
    resetImpactConfig,
    consistencyConfig,
  };
}
