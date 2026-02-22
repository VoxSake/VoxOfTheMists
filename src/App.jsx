import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isAnonymizedAccount,
  downloadCsv,
} from "./utils";
import { useTimeZone } from "./hooks/useTimeZone";
import { usePersistedState } from "./hooks/usePersistedState";
import { useToast } from "./hooks/useToast.jsx";
import { useDashboardStats } from "./hooks/useDashboardStats";
import { useShareSettings } from "./hooks/useShareSettings";
import { usePaginatedRows } from "./hooks/usePaginatedRows";
import { useGuildCheckJob } from "./hooks/useGuildCheckJob";
import { useSortable } from "./hooks/useSortable";
import { useAccountSearchFilter } from "./hooks/useAccountSearchFilter";
import { useDashboardData } from "./hooks/useDashboardData";
import { useWeekComparison } from "./hooks/useWeekComparison";
import { usePlayerProfile } from "./hooks/usePlayerProfile";
import { useCompareAccounts } from "./hooks/useCompareAccounts";
import { useWatchlistAccounts } from "./hooks/useWatchlistAccounts";
import { useIngestionActions } from "./hooks/useIngestionActions";
import { useDashboardSectionConfigs } from "./hooks/useDashboardSectionConfigs";
import { useDashboardController } from "./hooks/useDashboardController";
import { useDashboardInsights } from "./hooks/useDashboardInsights";
import { AppView } from "./components/AppView";
import {
  LEADERBOARD_CSV_HEADERS,
  ANOMALIES_CSV_HEADERS,
  buildDeltaCsvHeaders,
  mapAnomalyRowsForCsv,
} from "./utils/csvExports";

/* ── Section navigation ── */
function parseBooleanTrue(raw) {
  return String(raw) === "1";
}

function parseBooleanNotZero(raw) {
  return String(raw) !== "0";
}

function parseBoundedInt(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export default function App() {
  const { allZones, timeZone, setTimeZone } = useTimeZone();
  const { addToast } = useToast();
  const [metric, setMetric] = useState("weeklyKills");
  const [compareBaseline, setCompareBaseline] = useState("raw");
  const [deltaMetric, setDeltaMetric] = useState("weeklyKills");
  const [topDelta, setTopDelta] = usePersistedState("vox-top-delta", 30, {
    parse: (raw) => parseBoundedInt(raw, 30, 5, 200),
    serialize: (v) => String(v),
  });
  const [showTotalDelta, setShowTotalDelta] = usePersistedState("vox-show-total-delta", true, {
    parse: parseBooleanNotZero,
    serialize: (v) => (v ? "1" : "0"),
  });
  const [anomalyMinDelta, setAnomalyMinDelta] = usePersistedState("vox-anomaly-min-delta", 80, {
    parse: (raw) => parseBoundedInt(raw, 80, 10, 5000),
    serialize: (v) => String(v),
  });
  const [topLeaderboard, setTopLeaderboard] = usePersistedState("vox-top-leaderboard", 300, {
    parse: (raw) => parseBoundedInt(raw, 300, 1, 300),
    serialize: (v) => String(v),
  });
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardPageSize, setLeaderboardPageSize] = useState(50);
  const [moversPage, setMoversPage] = usePersistedState("vox-movers-page", 1, {
    parse: (raw) => parseBoundedInt(raw, 1, 1, 999),
    serialize: (v) => String(v),
  });
  const [moversPageSize, setMoversPageSize] = usePersistedState("vox-movers-page-size", 50, {
    parse: (raw) => parseBoundedInt(raw, 50, 10, 100),
    serialize: (v) => String(v),
  });
  const [anomaliesPage, setAnomaliesPage] = usePersistedState("vox-anomalies-page", 1, {
    parse: (raw) => parseBoundedInt(raw, 1, 1, 999),
    serialize: (v) => String(v),
  });
  const [anomaliesPageSize, setAnomaliesPageSize] = usePersistedState("vox-anomalies-page-size", 50, {
    parse: (raw) => parseBoundedInt(raw, 50, 10, 100),
    serialize: (v) => String(v),
  });
  const [topProgression, setTopProgression] = useState(10);
  const [scope, setScope] = useState("week");
  const [selectedWeekEnd, setSelectedWeekEnd] = usePersistedState("vox-selected-week-end", "", {
    parse: (raw) => String(raw || "").trim(),
    serialize: (v) => String(v || ""),
  });
  const [allTimeRange, setAllTimeRange] = useState("30d");
  const [search, setSearch] = useState("");
  const [resetImpactWindow, setResetImpactWindow] = useState(5);
  const [consistencyTop, setConsistencyTop] = usePersistedState("vox-consistency-top", 20, {
    parse: (raw) => parseBoundedInt(raw, 20, 5, 100),
    serialize: (v) => String(v),
  });
  const [watchlistMinGain, setWatchlistMinGain] = usePersistedState("vox-watchlist-min-gain", 30, {
    parse: (raw) => parseBoundedInt(raw, 30, 0, 5000),
    serialize: (v) => String(v),
  });
  const [watchlistMinRankUp, setWatchlistMinRankUp] = usePersistedState("vox-watchlist-min-rankup", 3, {
    parse: (raw) => parseBoundedInt(raw, 3, 0, 200),
    serialize: (v) => String(v),
  });
  const [themeDark, setThemeDark] = usePersistedState("vox-theme", true, {
    parse: (raw) => String(raw) !== "light",
    serialize: (v) => (v ? "dark" : "light"),
  });
  const [plainMode, setPlainMode] = usePersistedState("vox-plain-mode", false, {
    parse: parseBooleanTrue,
    serialize: (v) => (v ? "1" : "0"),
  });
  const [hideAnonymized, setHideAnonymized] = usePersistedState("vox-hide-anonymized", false, {
    parse: parseBooleanTrue,
    serialize: (v) => (v ? "1" : "0"),
  });
  const [nowMs, setNowMs] = useState(Date.now());
  const guildCheck = useGuildCheckJob({ addToast });

  useEffect(() => {
    document.body.classList.toggle("dark", themeDark);
  }, [themeDark]);

  useEffect(() => {
    document.body.classList.toggle("plain-mode", plainMode);
  }, [plainMode]);

  const isVisibleAccount = useCallback(
    (name) => !hideAnonymized || !isAnonymizedAccount(name),
    [hideAnonymized]
  );
  const {
    compareAccounts,
    compareInput,
    suggestions,
    addCompareAccount,
    removeCompareAccount,
    handleCompareInputChange,
  } = useCompareAccounts({ hideAnonymized, isAnonymizedAccount, maxAccounts: 10 });
  const {
    watchlistAccounts,
    watchlistInput,
    watchlistSuggestions,
    addWatchlistAccount,
    removeWatchlistAccount,
    handleWatchlistInputChange,
  } = useWatchlistAccounts({ hideAnonymized, isAnonymizedAccount, maxAccounts: 10 });

  const {
    profileInput,
    profileSuggestions,
    profileAccount,
    profileState,
    profileSummary,
    profileRows,
    handleSelectProfile,
    handleProfileInputChange,
  } = usePlayerProfile({ hideAnonymized, isAnonymizedAccount });

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const allTimeDaysParam =
    scope === "all" ? (allTimeRange === "full" ? null : allTimeRange === "90d" ? 90 : 30) : null;
  const effectiveCompareAccounts = useMemo(
    () => (hideAnonymized ? compareAccounts.filter((a) => !isAnonymizedAccount(a)) : compareAccounts),
    [compareAccounts, hideAnonymized]
  );
  const effectiveWatchlistAccounts = useMemo(
    () => (hideAnonymized ? watchlistAccounts.filter((a) => !isAnonymizedAccount(a)) : watchlistAccounts),
    [watchlistAccounts, hideAnonymized]
  );
  const {
    latestSnapshot,
    snapshotCount,
    entries,
    progressionPayload,
    comparePayload,
    deltaPayload,
    anomaliesPayload,
    resetImpactPayload,
    consistencyPayload,
    watchlistPayload,
    healthPayload,
    weeklyReport,
    weekOptions,
    snapshotRunning,
    appwriteSyncRunning,
    initialLoading,
    refreshAll,
    runManualSnapshot,
    runManualAppwriteSync,
  } = useDashboardData({
    addToast,
    topLeaderboard,
    topProgression,
    scope,
    allTimeDaysParam,
    effectiveCompareAccounts,
    topDelta,
    deltaMetric,
    anomalyMinDelta,
    resetImpactWindow,
    consistencyTop,
    effectiveWatchlistAccounts,
    watchlistMinGain,
    watchlistMinRankUp,
    selectedWeekEnd: selectedWeekEnd || null,
  });

  const {
    compareWeekA,
    compareWeekB,
    setCompareWeekA,
    setCompareWeekB,
    compareWeekOptions,
    weekCompareState,
    weekCompareSummary,
  } = useWeekComparison(weekOptions);

  useEffect(() => {
    if (!selectedWeekEnd) return;
    if (!weekOptions.some((w) => String(w?.weekEndUtc || "") === selectedWeekEnd)) {
      setSelectedWeekEnd("");
    }
  }, [selectedWeekEnd, weekOptions, setSelectedWeekEnd]);

  function handleLeaderboardPageSizeChange(size) {
    setLeaderboardPageSize(size);
    setLeaderboardPage(1);
  }

  function handleMoversPageSizeChange(size) {
    setMoversPageSize(size);
    setMoversPage(1);
  }

  function handleAnomaliesPageSizeChange(size) {
    setAnomaliesPageSize(size);
    setAnomaliesPage(1);
  }

  const {
    searchQuery,
    filteredEntries,
    filteredProgressionPayload,
    filteredComparePayload,
    filteredDeltaRows,
    filteredAnomalies,
    filteredResetImpactRows,
    filteredConsistencyRows,
    filteredWatchlistRows,
  } = useAccountSearchFilter({
    entries,
    search,
    hideAnonymized,
    isVisibleAccount,
    progressionPayload,
    comparePayload,
    deltaPayload,
    anomaliesPayload,
    resetImpactPayload,
    consistencyPayload,
    watchlistPayload,
  });

  useEffect(() => {
    setLeaderboardPage(1);
  }, [searchQuery, hideAnonymized, topLeaderboard]);

  useEffect(() => {
    setMoversPage(1);
  }, [topDelta, deltaMetric, scope, hideAnonymized]);

  useEffect(() => {
    setAnomaliesPage(1);
  }, [anomalyMinDelta, scope, hideAnonymized]);

  /* ── Sortable tables ── */
  const leaderboardSort = useSortable(filteredEntries, { key: "rank", dir: "asc" });
  const deltaSort = useSortable(filteredDeltaRows);
  const anomalySort = useSortable(filteredAnomalies);
  const resetImpactSort = useSortable(filteredResetImpactRows, { key: "gain", dir: "desc" });
  const consistencySort = useSortable(filteredConsistencyRows, { key: "consistencyScore", dir: "desc" });
  const watchlistSort = useSortable(filteredWatchlistRows, { key: "weeklyGain", dir: "desc" });

  const {
    nextSnapshotIso,
    ingestionStatus,
    lastPipelineEventIso,
    entriesPerSnapshot,
    velocityTotalWeeklyDelta,
    velocityAvgPerHour,
    velocityTopMover,
  } = useDashboardStats({
    healthPayload,
    latestSnapshot,
    nowMs,
    snapshotCount,
    filteredDeltaRows,
    deltaPayload,
  });

  const {
    compareSummaries,
    compareProjectionShare,
    movers,
    weekReset,
    dataQualityChecks,
    narrativeInsights,
  } = useDashboardInsights({
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
  });

  const {
    canRunManualSnapshot,
    onRefreshLeaderboard,
    topbarActions,
  } = useIngestionActions({
    healthPayload,
    appwriteSyncRunning,
    refreshAll,
    runManualAppwriteSync,
    addToast,
  });

  const leaderboardPagination = usePaginatedRows(leaderboardSort.sorted, leaderboardPage, leaderboardPageSize);
  const moversPagination = usePaginatedRows(deltaSort.sorted, moversPage, moversPageSize);
  const anomaliesPagination = usePaginatedRows(anomalySort.sorted, anomaliesPage, anomaliesPageSize);

  const shareSettings = useShareSettings({
    addToast,
    timeZone,
    shareData: {
      latestSnapshot,
      nextSnapshotIso,
      ingestionStatus,
      lastPipelineEventIso,
      snapshotCount,
      healthPayload,
      entriesPerSnapshot,
      weekReset,
      velocityTotalWeeklyDelta,
      velocityAvgPerHour,
      velocityTopMover,
      leaderboardRows: leaderboardSort.sorted,
      moverRows: deltaSort.sorted,
      anomalyRows: anomalySort.sorted,
      filteredProgressionPayload,
      filteredComparePayload,
      resetImpactRows: resetImpactSort.sorted,
      consistencyRows: consistencySort.sorted,
      compareSummaries,
      compareProjectionShare,
      compareWeekEndIso: comparePayload?.weekWindow?.endUtc || null,
    },
  });

  /* ── CSV exports ── */
  const exportLeaderboardCsv = useCallback(() => {
    downloadCsv(
      `vox-leaderboard-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      LEADERBOARD_CSV_HEADERS,
      filteredEntries
    );
    addToast({ title: "Export", description: "Leaderboard CSV downloaded.", variant: "success", duration: 3000 });
  }, [filteredEntries, addToast]);

  const exportDeltaCsv = useCallback(() => {
    const headers = buildDeltaCsvHeaders(showTotalDelta);
    downloadCsv(
      `vox-delta-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      headers,
      filteredDeltaRows
    );
    addToast({ title: "Export", description: "Delta CSV downloaded.", variant: "success", duration: 3000 });
  }, [showTotalDelta, filteredDeltaRows, addToast]);

  const exportAnomaliesCsv = useCallback(() => {
    const rows = mapAnomalyRowsForCsv(filteredAnomalies, timeZone);
    downloadCsv(
      `vox-anomalies-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      ANOMALIES_CSV_HEADERS,
      rows
    );
    addToast({ title: "Export", description: "Anomalies CSV downloaded.", variant: "success", duration: 3000 });
  }, [filteredAnomalies, timeZone, addToast]);

  const onPrevLeaderboardPage = useCallback(() => setLeaderboardPage((p) => Math.max(1, p - 1)), []);
  const onNextLeaderboardPage = useCallback(
    () => setLeaderboardPage((p) => Math.min(leaderboardPagination.totalPages, p + 1)),
    [leaderboardPagination.totalPages]
  );
  const onPrevMoversPage = useCallback(() => setMoversPage((p) => Math.max(1, p - 1)), []);
  const onNextMoversPage = useCallback(
    () => setMoversPage((p) => Math.min(moversPagination.totalPages, p + 1)),
    [moversPagination.totalPages]
  );
  const onPrevAnomaliesPage = useCallback(() => setAnomaliesPage((p) => Math.max(1, p - 1)), []);
  const onNextAnomaliesPage = useCallback(
    () => setAnomaliesPage((p) => Math.min(anomaliesPagination.totalPages, p + 1)),
    [anomaliesPagination.totalPages]
  );

  const { dashboardMainProps } = useDashboardSectionConfigs({
    search,
    setSearch,
    leaderboardPageSize,
    handleLeaderboardPageSizeChange,
    topLeaderboard,
    setTopLeaderboard,
    canRunManualSnapshot,
    onRefreshLeaderboard,
    runManualSnapshot,
    snapshotRunning,
    exportLeaderboardCsv,
    leaderboardPagination,
    onPrevLeaderboardPage,
    onNextLeaderboardPage,
    leaderboardSort,
    deltaMetric,
    setDeltaMetric,
    showTotalDelta,
    setShowTotalDelta,
    moversPageSize,
    handleMoversPageSizeChange,
    topDelta,
    setTopDelta,
    exportDeltaCsv,
    deltaPayload,
    movers,
    moversPagination,
    onPrevMoversPage,
    onNextMoversPage,
    deltaSort,
    anomalyMinDelta,
    setAnomalyMinDelta,
    anomaliesPageSize,
    handleAnomaliesPageSizeChange,
    exportAnomaliesCsv,
    anomalySort,
    anomaliesPagination,
    onPrevAnomaliesPage,
    onNextAnomaliesPage,
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
  });

  const { shellProps, settingsPanelProps } = useDashboardController({
    selectedWeekEnd,
    setSelectedWeekEnd,
    weekOptions,
    topbarActions,
    shareSettings,
    themeDark,
    allZones,
    timeZone,
    setTimeZone,
    hideAnonymized,
    setHideAnonymized,
    setThemeDark,
    plainMode,
    setPlainMode,
    dataQualityChecks,
  });

  return <AppView shellProps={shellProps} settingsPanelProps={settingsPanelProps} dashboardMainProps={dashboardMainProps} />;
}
