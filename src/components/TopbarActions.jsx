export function TopbarActions({
  selectedWeekEnd,
  setSelectedWeekEnd,
  weekOptions,
  canRunManualAppwriteSync,
  appwriteSyncBusy,
  onRunManualAppwriteSync,
  onShareReport,
  onOpenSettings,
}) {
  return (
    <div className="toolbar">
      <select value={selectedWeekEnd} onChange={(e) => setSelectedWeekEnd(e.target.value)} title="Select archived week">
        <option value="">Current Live Week</option>
        {weekOptions.map((w) => (
          <option key={w.weekEndUtc} value={w.weekEndUtc}>
            {w.label}
          </option>
        ))}
      </select>
      {canRunManualAppwriteSync ? (
        <button className="btn btn-snapshot" disabled={appwriteSyncBusy} onClick={onRunManualAppwriteSync}>
          {appwriteSyncBusy ? "Appwrite Sync..." : "↻ Appwrite Sync"}
        </button>
      ) : null}
      <button className="btn ghost" onClick={onShareReport}>
        Share Report
      </button>
      <button className="btn ghost" onClick={onOpenSettings}>
        Settings
      </button>
    </div>
  );
}
