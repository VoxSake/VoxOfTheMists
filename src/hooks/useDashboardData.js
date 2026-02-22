import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { fmtNumber } from "../utils";
import { useSnapshotStatusPolling } from "./useSnapshotStatusPolling";
import { useWatchlistAlerts } from "./useWatchlistAlerts";

export function useDashboardData({
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
  selectedWeekEnd,
}) {
  const [latestSnapshot, setLatestSnapshot] = useState(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [entries, setEntries] = useState([]);
  const [progressionPayload, setProgressionPayload] = useState(null);
  const [comparePayload, setComparePayload] = useState(null);
  const [deltaPayload, setDeltaPayload] = useState(null);
  const [anomaliesPayload, setAnomaliesPayload] = useState(null);
  const [resetImpactPayload, setResetImpactPayload] = useState(null);
  const [consistencyPayload, setConsistencyPayload] = useState(null);
  const [watchlistPayload, setWatchlistPayload] = useState(null);
  const [healthPayload, setHealthPayload] = useState(null);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [weekOptions, setWeekOptions] = useState([]);
  const [snapshotRunning, setSnapshotRunning] = useState(false);
  const [appwriteSyncRunning, setAppwriteSyncRunning] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const compareAccountsRef = useRef(effectiveCompareAccounts);
  const scopeRef = useRef(scope);
  const allTimeDaysParamRef = useRef(allTimeDaysParam);
  const selectedWeekEndRef = useRef(selectedWeekEnd);
  const lastFinishedAtRef = useRef(null);
  const latestSnapshotIdRef = useRef(null);

  compareAccountsRef.current = effectiveCompareAccounts;
  scopeRef.current = scope;
  allTimeDaysParamRef.current = allTimeDaysParam;
  selectedWeekEndRef.current = selectedWeekEnd;
  latestSnapshotIdRef.current = latestSnapshot?.snapshotId || null;

  const reportBackgroundError = useCallback((source, error) => {
    console.error(`[useDashboardData] ${source} failed`, error);
  }, []);

  const loadOverview = useCallback(async () => {
    const [latest, snapshots] = await Promise.all([
      api.getLatest({ top: topLeaderboard, weekEnd: scope === "week" ? selectedWeekEnd : null }),
      api.getSnapshots(),
    ]);
    setLatestSnapshot(latest.snapshot);
    setEntries(latest.entries || []);
    setSnapshotCount((snapshots.snapshots || []).length);
  }, [topLeaderboard, scope, selectedWeekEnd]);

  const loadProgression = useCallback(async () => {
    const payload = await api.getProgressionTop({
      top: topProgression,
      scope,
      days: allTimeDaysParam,
      weekEnd: scope === "week" ? selectedWeekEnd : null,
    });
    setProgressionPayload(payload);
  }, [topProgression, scope, allTimeDaysParam, selectedWeekEnd]);

  const loadCompare = useCallback(async (accounts = compareAccountsRef.current) => {
    if (!accounts.length) {
      setComparePayload(null);
      return;
    }
    const payload = await api.getCompare({
      accounts,
      scope: scopeRef.current,
      days: allTimeDaysParamRef.current,
      weekEnd: scopeRef.current === "week" ? selectedWeekEndRef.current : null,
    });
    setComparePayload(payload);
  }, []);

  const loadDelta = useCallback(async () => {
    const payload = await api.getLeaderboardDelta({
      top: topDelta,
      metric: deltaMetric,
      scope,
      weekEnd: scope === "week" ? selectedWeekEnd : null,
    });
    setDeltaPayload(payload);
  }, [topDelta, deltaMetric, scope, selectedWeekEnd]);

  const loadAnomalies = useCallback(async () => {
    const payload = await api.getAnomalies({
      top: 20,
      minDeltaAbs: anomalyMinDelta,
      lookbackHours: 72,
      scope,
      weekEnd: scope === "week" ? selectedWeekEnd : null,
    });
    setAnomaliesPayload(payload);
  }, [anomalyMinDelta, scope, selectedWeekEnd]);

  const loadResetImpact = useCallback(async () => {
    const windowHours = Math.max(1, Math.min(24, Number(resetImpactWindow || 5)));
    const payload = await api.getResetImpact({ top: 20, windowHours, weekEnd: selectedWeekEnd });
    setResetImpactPayload(payload);
  }, [resetImpactWindow, selectedWeekEnd]);

  const loadConsistency = useCallback(async () => {
    const payload = await api.getConsistency({
      top: consistencyTop,
      scope,
      days: allTimeDaysParam,
      weekEnd: scope === "week" ? selectedWeekEnd : null,
    });
    setConsistencyPayload(payload);
  }, [consistencyTop, scope, allTimeDaysParam, selectedWeekEnd]);

  const loadWatchlist = useCallback(async () => {
    if (!effectiveWatchlistAccounts.length) {
      setWatchlistPayload(null);
      return;
    }
    const payload = await api.getWatchlist({
      accounts: effectiveWatchlistAccounts,
      minGain: watchlistMinGain,
      minRankUp: watchlistMinRankUp,
      scope,
      weekEnd: scope === "week" ? selectedWeekEnd : null,
    });
    setWatchlistPayload(payload);
  }, [effectiveWatchlistAccounts, watchlistMinGain, watchlistMinRankUp, scope, selectedWeekEnd]);

  const loadHealth = useCallback(async () => {
    const payload = await api.getHealth();
    setHealthPayload(payload);
    setAppwriteSyncRunning(Boolean(payload?.appwriteSync?.running));
  }, []);

  const loadWeeklyReport = useCallback(async () => {
    setWeeklyReport(await api.getWeeklyReport({ weekEnd: selectedWeekEnd }));
  }, [selectedWeekEnd]);

  const loadWeeks = useCallback(async () => {
    const payload = await api.getWeeks();
    setWeekOptions(Array.isArray(payload?.weeks) ? payload.weeks : []);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadOverview(),
      loadProgression(),
      loadCompare(),
      loadDelta(),
      loadAnomalies(),
      loadResetImpact(),
      loadConsistency(),
      loadWatchlist(),
      loadHealth(),
      loadWeeklyReport(),
      loadWeeks(),
    ]);
  }, [
    loadOverview,
    loadProgression,
    loadCompare,
    loadDelta,
    loadAnomalies,
    loadResetImpact,
    loadConsistency,
    loadWatchlist,
    loadHealth,
    loadWeeklyReport,
    loadWeeks,
  ]);

  const runManualSnapshot = useCallback(async () => {
    if (snapshotRunning) return;
    setSnapshotRunning(true);
    addToast({ title: "Snapshot", description: "Running snapshot...", variant: "default", duration: 3000 });
    try {
      await api.runManualSnapshot();
      await refreshAll();
      addToast({ title: "Snapshot Complete", description: "Data has been refreshed.", variant: "success" });
    } catch (error) {
      addToast({ title: "Snapshot Failed", description: error.message, variant: "error" });
    } finally {
      setSnapshotRunning(false);
    }
  }, [snapshotRunning, addToast, refreshAll]);

  const runManualAppwriteSync = useCallback(async () => {
    if (appwriteSyncRunning) return;
    setAppwriteSyncRunning(true);
    addToast({ title: "Appwrite Sync", description: "Running sync...", variant: "default", duration: 3000 });
    try {
      const payload = await api.runManualAppwriteSync();
      const result = payload?.result || {};
      const importedSnapshots = Math.max(0, Number(result.importedSnapshots || 0));
      const importedEntries = Math.max(0, Number(result.importedEntries || 0));
      const fetched = Math.max(0, Number(result.fetched || 0));

      if (importedSnapshots > 0) {
        await refreshAll();
        addToast({
          title: "Appwrite Sync Complete",
          description: `Imported ${fmtNumber(importedSnapshots)} snapshot(s), ${fmtNumber(importedEntries)} entries.`,
          variant: "success",
        });
      } else {
        await loadHealth().catch(() => {});
        const latestCreatedAt = String(latestSnapshot?.createdAt || "").trim();
        const description =
          fetched > 0
            ? `Checked ${fmtNumber(fetched)} snapshot(s), but none were imported.`
            : latestCreatedAt
              ? `No Appwrite snapshots are newer than local latest (${latestCreatedAt} UTC).`
              : "No snapshots are available in Appwrite yet.";
        addToast({
          title: "Appwrite Sync",
          description,
          variant: "default",
          duration: 4500,
        });
      }
    } catch (error) {
      addToast({ title: "Appwrite Sync Failed", description: error.message, variant: "error" });
    } finally {
      setAppwriteSyncRunning(false);
    }
  }, [appwriteSyncRunning, latestSnapshot, addToast, refreshAll, loadHealth]);

  const fetchSnapshotStatus = useCallback(async () => {
    try {
      const status = await api.getSnapshotStatus();
      setSnapshotRunning(Boolean(status.running));
      let refreshed = false;
      const previousFinishedAt = lastFinishedAtRef.current;
      const currentFinishedAt = status.lastFinishedAt || null;
      const firstSeenFinished = !previousFinishedAt && Boolean(currentFinishedAt);
      const hasNewFinished =
        Boolean(currentFinishedAt) && Boolean(previousFinishedAt) && currentFinishedAt !== previousFinishedAt;

      lastFinishedAtRef.current = currentFinishedAt;

      if ((firstSeenFinished || hasNewFinished) && Number(status.lastExitCode) === 0) {
        await refreshAll();
        refreshed = true;
        if (status.lastTrigger === "hourly") {
          addToast({ title: "Auto Snapshot", description: "Hourly snapshot done - data refreshed.", variant: "success" });
        }
      }

      const health = await api.getHealth();
      setHealthPayload(health);
      setAppwriteSyncRunning(Boolean(health?.appwriteSync?.running));
      const serverLatestSnapshotId = health?.latestSnapshot?.snapshotId || null;
      const hasNewLatestSnapshot =
        Boolean(serverLatestSnapshotId) && serverLatestSnapshotId !== latestSnapshotIdRef.current;
      if (!refreshed && hasNewLatestSnapshot) {
        await refreshAll();
        if (health?.appwriteSyncEnabled) {
          addToast({ title: "Appwrite Sync", description: "Snapshot synced - data refreshed.", variant: "success" });
        }
      }
    } catch {
      // Ignore transient polling errors.
    }
  }, [addToast, refreshAll]);

  useEffect(() => {
    loadOverview()
      .then(() => setInitialLoading(false))
      .catch((err) => {
        setInitialLoading(false);
        reportBackgroundError("loadOverview", err);
      });
  }, [loadOverview, reportBackgroundError]);

  useEffect(() => {
    loadProgression().catch((err) => reportBackgroundError("loadProgression", err));
  }, [loadProgression, reportBackgroundError]);

  useEffect(() => {
    loadCompare().catch((err) => reportBackgroundError("loadCompare", err));
  }, [loadCompare, effectiveCompareAccounts, scope, allTimeDaysParam, selectedWeekEnd, reportBackgroundError]);

  useEffect(() => {
    loadDelta().catch((err) => reportBackgroundError("loadDelta", err));
  }, [loadDelta, reportBackgroundError]);

  useEffect(() => {
    loadAnomalies().catch((err) => reportBackgroundError("loadAnomalies", err));
  }, [loadAnomalies, reportBackgroundError]);

  useEffect(() => {
    loadResetImpact().catch((err) => reportBackgroundError("loadResetImpact", err));
  }, [loadResetImpact, reportBackgroundError]);

  useEffect(() => {
    loadConsistency().catch((err) => reportBackgroundError("loadConsistency", err));
  }, [loadConsistency, reportBackgroundError]);

  useEffect(() => {
    loadWatchlist().catch((err) => reportBackgroundError("loadWatchlist", err));
  }, [loadWatchlist, reportBackgroundError]);

  useWatchlistAlerts({ watchlistPayload, addToast });

  useEffect(() => {
    loadHealth().catch((err) => reportBackgroundError("loadHealth", err));
    loadWeeklyReport().catch((err) => reportBackgroundError("loadWeeklyReport", err));
    loadWeeks().catch((err) => reportBackgroundError("loadWeeks", err));
  }, [loadHealth, loadWeeklyReport, loadWeeks, reportBackgroundError]);

  useSnapshotStatusPolling(fetchSnapshotStatus);

  return {
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
  };
}
