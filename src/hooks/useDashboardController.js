import { useMemo } from "react";

export function useDashboardController({
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
}) {
  const shellProps = useMemo(
    () => ({
      selectedWeekEnd,
      setSelectedWeekEnd,
      weekOptions,
      canRunManualAppwriteSync: topbarActions.canRunManualAppwriteSync,
      appwriteSyncBusy: topbarActions.appwriteSyncBusy,
      onRunManualAppwriteSync: topbarActions.onRunManualAppwriteSync,
      onShareReport: shareSettings.exportShareSnapshotHtml,
      onOpenSettings: () => shareSettings.setSettingsOpen(true),
      themeDark,
    }),
    [selectedWeekEnd, setSelectedWeekEnd, weekOptions, topbarActions, shareSettings, themeDark]
  );

  const settingsPanelProps = useMemo(
    () => ({
      isOpen: shareSettings.settingsOpen,
      onClose: () => shareSettings.setSettingsOpen(false),
      allZones,
      timeZone,
      setTimeZone,
      hideAnonymized,
      setHideAnonymized,
      themeDark,
      setThemeDark,
      plainMode,
      setPlainMode,
      discordWebhookEnabled: shareSettings.discordWebhookEnabled,
      setDiscordWebhookEnabled: shareSettings.setDiscordWebhookEnabled,
      discordWebhookUrl: shareSettings.discordWebhookUrl,
      setDiscordWebhookUrl: shareSettings.setDiscordWebhookUrl,
      sharePreset: shareSettings.sharePreset,
      setSharePreset: shareSettings.setSharePreset,
      onTestDiscordWebhook: shareSettings.testDiscordWebhook,
      webhookTesting: shareSettings.webhookTesting,
      dataQualityChecks,
    }),
    [
      shareSettings,
      allZones,
      timeZone,
      setTimeZone,
      hideAnonymized,
      setHideAnonymized,
      themeDark,
      setThemeDark,
      plainMode,
      setPlainMode,
      dataQualityChecks,
    ]
  );

  return {
    shellProps,
    settingsPanelProps,
  };
}
