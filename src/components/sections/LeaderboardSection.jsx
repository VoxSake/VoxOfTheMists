import { ErrorBoundary } from "../ErrorBoundary";
import { SkeletonRow } from "../Skeleton";
import { SortTh } from "../SortTh";
import { fmtNumber, formatTimestamp } from "../../utils";

export function LeaderboardSection({
  search,
  setSearch,
  leaderboardPageSize,
  setLeaderboardPageSize,
  topLeaderboard,
  setTopLeaderboard,
  canRunManualSnapshot,
  onRefresh,
  runManualSnapshot,
  snapshotRunning,
  canRunManualAppwriteSync,
  appwriteSyncBusy,
  runManualAppwriteSync,
  exportLeaderboardCsv,
  latestSnapshot,
  timeZone,
  leaderboardStartIndex,
  leaderboardEndIndex,
  leaderboardTotalRows,
  clampedLeaderboardPage,
  leaderboardTotalPages,
  onPrevPage,
  onNextPage,
  healthPayload,
  initialLoading,
  leaderboardSort,
  leaderboardVisibleRows,
}) {
  return (
    <ErrorBoundary name="Leaderboard">
      <section className="card" id="leaderboard">
        <div className="section-head">
          <h2>Leaderboard</h2>
          <div className="toolbar">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search account..." />
            <select
              value={leaderboardPageSize}
              onChange={(e) => setLeaderboardPageSize(Math.max(10, Math.min(100, Number(e.target.value || 50))))}
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <input
              type="number"
              min={1}
              max={300}
              value={topLeaderboard}
              onChange={(e) => setTopLeaderboard(Math.max(1, Math.min(300, Number(e.target.value || 300))))}
            />
            {canRunManualSnapshot ? (
              <button className="btn ghost" onClick={onRefresh}>
                ↻ Refresh
              </button>
            ) : null}
            {canRunManualSnapshot ? (
              <button className="btn btn-snapshot" disabled={snapshotRunning} onClick={runManualSnapshot}>
                {snapshotRunning ? "Snapshot..." : "⚡ Snapshot"}
              </button>
            ) : null}
            {canRunManualAppwriteSync ? (
              <button className="btn btn-snapshot" disabled={appwriteSyncBusy} onClick={runManualAppwriteSync}>
                {appwriteSyncBusy ? "Appwrite Sync..." : "↻ Appwrite Sync"}
              </button>
            ) : null}
            <button className="btn ghost" onClick={exportLeaderboardCsv}>
              ↓ CSV
            </button>
          </div>
        </div>
        <p className="muted">
          {latestSnapshot
            ? `Snapshot: ${formatTimestamp(latestSnapshot.createdAt, timeZone)} | Region: ${latestSnapshot.region}`
            : "No snapshot found. Run the scraper first."}
        </p>
        <div className="leaderboard-pagination">
          <p className="muted">
            Showing {leaderboardStartIndex}-{leaderboardEndIndex} of {leaderboardTotalRows} rows
          </p>
          <div className="toolbar compact">
            <button className="btn ghost" disabled={clampedLeaderboardPage <= 1} onClick={onPrevPage}>
              Prev
            </button>
            <span className="muted">
              Page {clampedLeaderboardPage} / {leaderboardTotalPages}
            </span>
            <button className="btn ghost" disabled={clampedLeaderboardPage >= leaderboardTotalPages} onClick={onNextPage}>
              Next
            </button>
          </div>
        </div>
        {!canRunManualSnapshot ? <p className="muted">Manual snapshots are disabled in Appwrite mode.</p> : null}
        {healthPayload?.appwriteSyncEnabled && !healthPayload?.appwriteSyncConfigured ? (
          <p className="muted">Appwrite sync is enabled but not fully configured in server env.</p>
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh sortable={leaderboardSort} sortKey="rank">Rank</SortTh>
                <SortTh sortable={leaderboardSort} sortKey="accountName">Account</SortTh>
                <SortTh sortable={leaderboardSort} sortKey="weeklyKills">Weekly Kills</SortTh>
                <SortTh sortable={leaderboardSort} sortKey="totalKills">Total Kills</SortTh>
              </tr>
            </thead>
            <tbody>
              {initialLoading
                ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} cols={4} />)
                : leaderboardVisibleRows.map((item) => (
                    <tr key={`${item.rank}-${item.accountName}`}>
                      <td>{item.rank}.</td>
                      <td>{item.accountName}</td>
                      <td>{fmtNumber(item.weeklyKills)}</td>
                      <td>{fmtNumber(item.totalKills)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>
    </ErrorBoundary>
  );
}
