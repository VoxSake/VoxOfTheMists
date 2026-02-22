import { useCallback, useMemo } from "react";

export function useIngestionActions({
  healthPayload,
  appwriteSyncRunning,
  refreshAll,
  runManualAppwriteSync,
  addToast,
}) {
  const canRunManualSnapshot = healthPayload != null && !healthPayload.appwriteSyncEnabled;
  const canRunManualAppwriteSync =
    healthPayload != null && healthPayload.appwriteSyncEnabled && healthPayload.appwriteSyncConfigured;
  const appwriteSyncBusy = appwriteSyncRunning || Boolean(healthPayload?.appwriteSync?.running);

  const onRefreshLeaderboard = useCallback(() => {
    refreshAll().catch(console.error);
    addToast({ title: "Refreshing", description: "Fetching latest data...", variant: "default", duration: 2000 });
  }, [refreshAll, addToast]);

  const topbarActions = useMemo(
    () => ({
      canRunManualAppwriteSync,
      appwriteSyncBusy,
      onRunManualAppwriteSync: runManualAppwriteSync,
    }),
    [canRunManualAppwriteSync, appwriteSyncBusy, runManualAppwriteSync]
  );

  return {
    canRunManualSnapshot,
    canRunManualAppwriteSync,
    appwriteSyncBusy,
    onRefreshLeaderboard,
    topbarActions,
  };
}
