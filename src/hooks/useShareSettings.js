import { useEffect, useState } from "react";
import { api } from "../api/client";
import { downloadText, fmtNumber, formatTimestamp } from "../utils";
import { usePersistedState } from "./usePersistedState";

function parseBooleanTrue(raw) {
  return String(raw) === "1";
}

function isValidDiscordWebhookUrl(url) {
  return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/[^/\s]+\/[^/\s]+/i.test(String(url || "").trim());
}

export function useShareSettings({ addToast, timeZone, shareData }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [discordWebhookEnabled, setDiscordWebhookEnabled] = usePersistedState("vox-discord-webhook-enabled", false, {
    parse: parseBooleanTrue,
    serialize: (v) => (v ? "1" : "0"),
  });
  const [discordWebhookUrl, setDiscordWebhookUrl] = usePersistedState("vox-discord-webhook-url", "", {
    parse: (raw) => String(raw || "").trim(),
    serialize: (v) => String(v || "").trim(),
  });
  const [webhookTesting, setWebhookTesting] = useState(false);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  async function exportShareSnapshotHtml() {
    try {
      const snapshot = {
        generatedAt: formatTimestamp(new Date().toISOString(), timeZone),
        timeZone,
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
              ? `${shareData.velocityTopMover.accountName} (+${fmtNumber(shareData.velocityTopMover.weeklyKillsDelta)})`
              : "-"
          }`,
        },
        leaderboard: shareData.leaderboardRows.map((r) => ({
          rank: r.rank,
          accountName: r.accountName,
          weeklyKills: fmtNumber(r.weeklyKills),
          totalKills: fmtNumber(r.totalKills),
        })),
        movers: shareData.moverRows.map((r) => ({
          latestRank: r.latestRank,
          previousRank: r.previousRank,
          rankChange: r.rankChange == null ? "-" : `${r.rankChange > 0 ? "+" : ""}${r.rankChange}`,
          accountName: r.accountName,
          weeklyKillsDelta: `${Number(r.weeklyKillsDelta) > 0 ? "+" : ""}${fmtNumber(r.weeklyKillsDelta)}`,
          totalKillsDelta: `${Number(r.totalKillsDelta) > 0 ? "+" : ""}${fmtNumber(r.totalKillsDelta)}`,
        })),
        anomalies: shareData.anomalyRows.map((r) => ({
          createdAt: formatTimestamp(r.createdAt, timeZone),
          accountName: r.accountName,
          direction: r.direction ? r.direction.charAt(0).toUpperCase() + r.direction.slice(1) : "-",
          latestDelta: `${Number(r.latestDelta) > 0 ? "+" : ""}${fmtNumber(r.latestDelta)}`,
          baselineAvg: fmtNumber(r.baselineAvg),
          deviation: `${Number(r.deviation) > 0 ? "+" : ""}${fmtNumber(r.deviation)}`,
          deviationPct: `${Number(r.deviationPct) > 0 ? "+" : ""}${r.deviationPct}`,
        })),
        resetImpact: shareData.resetImpactRows.map((r) => ({
          accountName: r.accountName,
          startRank: r.startRank,
          endRank: r.endRank,
          rankGain: `${Number(r.rankGain) > 0 ? "+" : ""}${r.rankGain}`,
          gain: `${Number(r.gain) > 0 ? "+" : ""}${fmtNumber(r.gain)}`,
          totalGain: `${Number(r.totalGain) > 0 ? "+" : ""}${fmtNumber(r.totalGain)}`,
        })),
        consistency: shareData.consistencyRows.map((r) => ({
          accountName: r.accountName,
          consistencyScore: r.consistencyScore,
          avgDelta: fmtNumber(r.avgDelta),
          stddevDelta: fmtNumber(r.stddevDelta),
          activeIntervals: fmtNumber(r.activeIntervals),
          totalGain: fmtNumber(r.totalGain),
        })),
        compareSummaries: shareData.compareSummaries.map((s) => {
          const totalHours =
            Number(s.hoursByDay?.Friday || 0) +
            Number(s.hoursByDay?.Saturday || 0) +
            Number(s.hoursByDay?.Sunday || 0) +
            Number(s.hoursByDay?.Monday || 0) +
            Number(s.hoursByDay?.Tuesday || 0) +
            Number(s.hoursByDay?.Wednesday || 0) +
            Number(s.hoursByDay?.Thursday || 0);
          return { ...s, totalHours };
        }),
      };
      const { buildSnapshotHtml } = await import("../utils/snapshotExport");
      const html = buildSnapshotHtml(snapshot);
      const filename = `vox-share-snapshot-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.html`;
      downloadText(filename, html, "text/html;charset=utf-8;");
      if (discordWebhookEnabled) {
        if (!isValidDiscordWebhookUrl(discordWebhookUrl)) {
          addToast({
            title: "Share Snapshot",
            description: "HTML downloaded. Discord webhook URL is invalid.",
            variant: "error",
            duration: 4000,
          });
          return;
        }
        await api.shareSnapshotToDiscord({
          webhookUrl: discordWebhookUrl.trim(),
          filename,
          html,
          content: `Vox snapshot export (${formatTimestamp(new Date().toISOString(), timeZone)} - ${timeZone})`,
        });
        addToast({
          title: "Share Snapshot",
          description: "HTML downloaded and sent to Discord webhook.",
          variant: "success",
          duration: 3500,
        });
        return;
      }
      addToast({
        title: "Share Snapshot",
        description: "Single-file HTML exported.",
        variant: "success",
        duration: 3000,
      });
    } catch (error) {
      addToast({ title: "Share Snapshot Failed", description: error.message, variant: "error" });
    }
  }

  async function testDiscordWebhook() {
    if (webhookTesting) return;
    const webhookUrl = String(discordWebhookUrl || "").trim();
    if (!isValidDiscordWebhookUrl(webhookUrl)) {
      addToast({ title: "Webhook Test", description: "Discord webhook URL is invalid.", variant: "error", duration: 3500 });
      return;
    }
    setWebhookTesting(true);
    try {
      await api.testDiscordWebhook(webhookUrl);
      addToast({ title: "Webhook Test", description: "Discord webhook is reachable.", variant: "success", duration: 3000 });
    } catch (error) {
      addToast({ title: "Webhook Test Failed", description: error.message, variant: "error", duration: 4500 });
    } finally {
      setWebhookTesting(false);
    }
  }

  return {
    settingsOpen,
    setSettingsOpen,
    discordWebhookEnabled,
    setDiscordWebhookEnabled,
    discordWebhookUrl,
    setDiscordWebhookUrl,
    webhookTesting,
    exportShareSnapshotHtml,
    testDiscordWebhook,
  };
}
