export function SettingsPanel({
  isOpen,
  onClose,
  allZones,
  timeZone,
  setTimeZone,
  hideAnonymized,
  setHideAnonymized,
  themeDark,
  setThemeDark,
  plainMode,
  setPlainMode,
  discordWebhookEnabled,
  setDiscordWebhookEnabled,
  discordWebhookUrl,
  setDiscordWebhookUrl,
  sharePreset,
  setSharePreset,
  onTestDiscordWebhook,
  webhookTesting,
  dataQualityChecks,
}) {
  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <aside className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3>Settings</h3>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>

        <div className="settings-group">
          <p className="settings-label">Display</p>
          <label className="settings-row">
            <span>Timezone</span>
            <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
              {allZones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={hideAnonymized}
              onChange={(e) => setHideAnonymized(e.target.checked)}
            />
            Hide anonymized accounts
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={themeDark}
              onChange={(e) => setThemeDark(e.target.checked)}
            />
            Dark theme
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={plainMode}
              onChange={(e) => setPlainMode(e.target.checked)}
            />
            Reduce visual effects
          </label>
        </div>

        <div className="settings-group">
          <p className="settings-label">Data Quality</p>
          <div className="quality-compact-list">
            {(dataQualityChecks || []).map((check) => {
              return (
                <div key={check.id} className={`quality-compact-item quality-${check.status || "alert"}`}>
                  <div>
                    <p className="quality-compact-title">{check.title}</p>
                    <p className="quality-compact-detail">{check.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="settings-group">
          <p className="settings-label">Share</p>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={discordWebhookEnabled}
              onChange={(e) => setDiscordWebhookEnabled(e.target.checked)}
            />
            Send report to Discord webhook
          </label>
          <label className="settings-row">
            <span>Report Preset</span>
            <select value={sharePreset} onChange={(e) => setSharePreset(e.target.value)}>
              <option value="full">Full detail</option>
              <option value="public-safe">Public-safe (masked)</option>
            </select>
          </label>
          <label className="settings-row">
            <span>Webhook URL</span>
            <input
              type="password"
              placeholder="https://discord.com/api/webhooks/..."
              value={discordWebhookUrl}
              onChange={(e) => setDiscordWebhookUrl(e.target.value)}
              disabled={!discordWebhookEnabled}
            />
          </label>
          <button
            className="btn ghost"
            onClick={onTestDiscordWebhook}
            disabled={!discordWebhookEnabled || !String(discordWebhookUrl || "").trim() || webhookTesting}
          >
            {webhookTesting ? "Testing..." : "Test Webhook"}
          </button>
          <p className="muted">
            Share Report always downloads the HTML file. When enabled, it also uploads it to Discord.
          </p>
        </div>
      </aside>
    </div>
  );
}
