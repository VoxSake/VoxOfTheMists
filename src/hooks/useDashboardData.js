import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { fmtNumber } from "../utils";
import { useSnapshotStatusPolling } from "./useSnapshotStatusPolling";

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
  const watchlistAlertSnapshotRef = useRef(null);
  const watchlistAlertSeenRef = useRef(new Set());

  compareAccountsRef.current = effectiveCompareAccounts;
  scopeRef.current = scope;
  allTimeDaysParamRef.current = allTimeDaysParam;
  selectedWeekEndRef.current = selectedWeekEnd;
  latestSnapshotIdRef.current = latestSnapshot?.snapshotId || null;

  const loadOverview = useCallback(async () => {
    const [latest, snapshots] = await Promise.all([api.getLatest(topLeaderboard), api.getSnapshots()]);
    setLatestSnapshot(latest.snapshot);
    setEntries(latest.entries || []);
    setSnapshotCount((snapshots.snapshots || []).length);
  }, [topLeaderboard]);

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
    const windowHours = Math.max(1, Math.min(24, Number(resetImpactWindow || 3)));
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
        console.error(err);
      });
  }, [loadOverview]);

  useEffect(() => {
    loadProgression().catch(console.error);
  }, [loadProgression]);

  useEffect(() => {
    loadCompare().catch(console.error);
  }, [loadCompare, effectiveCompareAccounts, scope, allTimeDaysParam, selectedWeekEnd]);

  useEffect(() => {
    loadDelta().catch(console.error);
  }, [loadDelta]);

  useEffect(() => {
    loadAnomalies().catch(console.error);
  }, [loadAnomalies]);

  useEffect(() => {
    loadResetImpact().catch(console.error);
  }, [loadResetImpact]);

  useEffect(() => {
    loadConsistency().catch(console.error);
  }, [loadConsistency]);

  useEffect(() => {
    loadWatchlist().catch(console.error);
  }, [loadWatchlist]);

  useEffect(() => {
    const rows = Array.isArray(watchlistPayload?.rows) ? watchlistPayload.rows : [];
    if (!rows.length) return;
    const snapshotId = String(watchlistPayload?.latest?.snapshotId || "").trim();
    if (!snapshotId) return;

    if (watchlistAlertSnapshotRef.current !== snapshotId) {
      watchlistAlertSnapshotRef.current = snapshotId;
      watchlistAlertSeenRef.current = new Set();
    }

    const newlyTriggered = rows.filter((row) => Boolean(row?.found) && Boolean(row?.triggered));
    if (!newlyTriggered.length) return;

    const unseen = [];
    for (const row of newlyTriggered) {
      const account = String(row.accountName || row.requestedAccount || "").trim();
      if (!account) continue;
      const key = `${snapshotId}|${account.toLowerCase()}`;
      if (watchlistAlertSeenRef.current.has(key)) continue;
      watchlistAlertSeenRef.current.add(key);
      unseen.push(row);
    }
    if (!unseen.length) return;

    const maxDetailedToasts = 5;
    for (const row of unseen.slice(0, maxDetailedToasts)) {
      const account = String(row.accountName || row.requestedAccount || "Unknown");
      const weeklyGain = Math.max(0, Number(row.weeklyGain || 0));
      const rankChange = Number.isFinite(Number(row.rankChange)) ? Number(row.rankChange) : 0;
      const detail =
        rankChange > 0
          ? `${account}: +${fmtNumber(weeklyGain)} weekly, +${fmtNumber(rankChange)} rank`
          : `${account}: +${fmtNumber(weeklyGain)} weekly`;
      addToast({
        title: "Watchlist Alert",
        description: detail,
        variant: "success",
        duration: 0,
      });
    }
    const remaining = unseen.length - maxDetailedToasts;
    if (remaining > 0) {
      addToast({
        title: "Watchlist Alert",
        description: `${fmtNumber(remaining)} more account(s) triggered in this snapshot.`,
        variant: "default",
        duration: 0,
      });
    }
  }, [watchlistPayload, addToast]);

  useEffect(() => {
    loadHealth().catch(console.error);
    loadWeeklyReport().catch(console.error);
    loadWeeks().catch(console.error);
  }, [loadHealth, loadWeeklyReport, loadWeeks]);

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
