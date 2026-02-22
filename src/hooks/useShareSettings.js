import { useEffect, useState } from "react";
import { api } from "../api/client";
import { downloadText, formatTimestamp } from "../utils";
import { usePersistedState } from "./usePersistedState";
import { buildShareReportPayload } from "../utils/shareReportPayload";

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
  const [sharePreset, setSharePreset] = usePersistedState("vox-share-preset", "full", {
    parse: (raw) => (String(raw || "").trim() === "public-safe" ? "public-safe" : "full"),
    serialize: (v) => (String(v || "").trim() === "public-safe" ? "public-safe" : "full"),
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
      const generatedAt = formatTimestamp(new Date().toISOString(), timeZone);
      const snapshot = buildShareReportPayload({ shareData, timeZone, generatedAt, preset: sharePreset });
      const { buildSnapshotHtml } = await import("../utils/snapshotExport");
      const html = buildSnapshotHtml(snapshot);
      const filename = `vox-share-report-${sharePreset}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.html`;
      downloadText(filename, html, "text/html;charset=utf-8;");
      if (discordWebhookEnabled) {
        if (!isValidDiscordWebhookUrl(discordWebhookUrl)) {
          addToast({
            title: "Share Report",
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
          content: `Vox of the Mists - Report - ${generatedAt}`,
        });
        addToast({
          title: "Share Report",
          description: "HTML report downloaded and sent to Discord webhook.",
          variant: "success",
          duration: 3500,
        });
        return;
      }
      addToast({
        title: "Share Report",
        description: "Single-file HTML report exported.",
        variant: "success",
        duration: 3000,
      });
    } catch (error) {
      addToast({ title: "Share Report Failed", description: error.message, variant: "error" });
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
    sharePreset,
    setSharePreset,
    webhookTesting,
    exportShareSnapshotHtml,
    testDiscordWebhook,
  };
}
