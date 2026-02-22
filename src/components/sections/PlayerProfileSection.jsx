import { useMemo, useState } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { fmtNumber, formatTimestamp } from "../../utils";

export function PlayerProfileSection({
  profileInput,
  onProfileInputChange,
  profileSuggestions,
  onSelectProfile,
  activeProfileAccount,
  profileLoading,
  profileError,
  profileSummary,
  profileRows,
  timeZone,
}) {
  const [rowsPage, setRowsPage] = useState(1);
  const [rowsPageSize, setRowsPageSize] = useState(12);
  const totalRows = Array.isArray(profileRows) ? profileRows.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPageSize));
  const clampedPage = Math.min(rowsPage, totalPages);
  const pagedRows = useMemo(() => {
    const start = (clampedPage - 1) * rowsPageSize;
    const end = start + rowsPageSize;
    return (profileRows || []).slice(start, end);
  }, [profileRows, clampedPage, rowsPageSize]);

  return (
    <ErrorBoundary name="Player Profile">
      <section className="card" id="profile">
        <div className="section-head">
          <h2>Player Profile Deep-Dive</h2>
          <div className="toolbar compact">
            <input
              list="profileSuggestions"
              value={profileInput}
              placeholder="Search account name"
              onChange={(e) => onProfileInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSelectProfile(profileInput);
                }
              }}
            />
            <datalist id="profileSuggestions">
              {profileSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <button className="btn ghost" onClick={() => onSelectProfile(profileInput)}>
              Open
            </button>
          </div>
        </div>

        {!activeProfileAccount ? <p className="muted">Pick an account to open historical deep-dive.</p> : null}
        {activeProfileAccount ? <p className="muted">Active profile: {activeProfileAccount}</p> : null}
        {profileLoading ? <p className="muted">Loading player history...</p> : null}
        {profileError ? <p className="muted">Profile unavailable: {profileError}</p> : null}

        {profileSummary ? (
          <div className="summary-grid">
            <article className="summary-card">
              <p className="summary-account">Rank Evolution</p>
              <p className="summary-main">
                {profileSummary.rankChange > 0 ? "+" : ""}
                {fmtNumber(profileSummary.rankChange)} positions over {fmtNumber(profileSummary.samplePoints)} snapshots.
              </p>
              <p className="summary-breakdown">Latest rank: {profileSummary.latestRank}</p>
            </article>

            <article className="summary-card">
              <p className="summary-account">Kill Progression</p>
              <p className="summary-main">
                Weekly: {profileSummary.weeklyGain > 0 ? "+" : ""}
                {fmtNumber(profileSummary.weeklyGain)} | Total: {profileSummary.totalGain > 0 ? "+" : ""}
                {fmtNumber(profileSummary.totalGain)}
              </p>
              <p className="summary-breakdown">
                Avg per snapshot: {profileSummary.avgWeeklyPerSnapshot > 0 ? "+" : ""}
                {fmtNumber(profileSummary.avgWeeklyPerSnapshot)}
              </p>
            </article>

            <article className="summary-card">
              <p className="summary-account">Recent Trend</p>
              <p className="summary-main">
                Last 12h: {profileSummary.recent12hGain > 0 ? "+" : ""}
                {fmtNumber(profileSummary.recent12hGain)} weekly kills
              </p>
              <p className="summary-breakdown">Cadence: {fmtNumber(profileSummary.avgHoursBetweenSnapshots)}h between snapshots</p>
            </article>
          </div>
        ) : null}

        {profileRows?.length ? (
          <div className="profile-history-block">
            <div className="leaderboard-pagination">
              <span className="muted">
                Snapshot History ({fmtNumber(totalRows)} rows)
              </span>
              <select
                value={rowsPageSize}
                onChange={(e) => {
                  setRowsPageSize(Number(e.target.value));
                  setRowsPage(1);
                }}
              >
                <option value={12}>12 / page</option>
                <option value={24}>24 / page</option>
                <option value={48}>48 / page</option>
              </select>
              <button className="btn ghost" onClick={() => setRowsPage((p) => Math.max(1, p - 1))} disabled={clampedPage <= 1}>
                Prev
              </button>
              <span className="muted">
                {clampedPage}/{totalPages}
              </span>
              <button
                className="btn ghost"
                onClick={() => setRowsPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
              >
                Next
              </button>
            </div>
            <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Snapshot Time</th>
                  <th>Rank</th>
                  <th>Weekly Kills</th>
                  <th>Total Kills</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={`profile-${row.snapshotId}`}>
                    <td>{formatTimestamp(row.createdAt, timeZone)}</td>
                    <td>{row.rank}</td>
                    <td>{fmtNumber(row.weeklyKills)}</td>
                    <td>{fmtNumber(row.totalKills)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ) : null}
      </section>
    </ErrorBoundary>
  );
}
