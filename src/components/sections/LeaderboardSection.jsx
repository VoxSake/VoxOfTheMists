import { useEffect, useState } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { SkeletonRow } from "../Skeleton";
import { SortTh } from "../SortTh";
import { fmtNumber, formatTimestamp } from "../../utils";

function formatGuildCell(name, tag) {
  const n = String(name || "").trim();
  const t = String(tag || "").trim();
  if (n && t) return `${n} [${t}]`;
  return n || t || "-";
}

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
  const [topLeaderboardDraft, setTopLeaderboardDraft] = useState(String(topLeaderboard));

  useEffect(() => {
    setTopLeaderboardDraft(String(topLeaderboard));
  }, [topLeaderboard]);

  const commitTopLeaderboard = (rawValue) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setTopLeaderboardDraft(String(topLeaderboard));
      return;
    }
    const clamped = Math.max(1, Math.min(300, Math.floor(parsed)));
    setTopLeaderboard(clamped);
    setTopLeaderboardDraft(String(clamped));
  };

  const handleTopLeaderboardChange = (rawValue) => {
    setTopLeaderboardDraft(rawValue);
    if (!rawValue) return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return;
    if (parsed < 1 || parsed > 300) return;
    setTopLeaderboard(parsed);
  };

  return (
    <ErrorBoundary name="Leaderboard">
      <section className="card" id="leaderboard">
        <div className="section-head">
          <h2>Leaderboard</h2>
          <div className="toolbar">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account / WvW guild / alliance guild..."
            />
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
              value={topLeaderboardDraft}
              aria-label="Top leaderboard rows"
              title="Top leaderboard rows"
              onChange={(e) => handleTopLeaderboardChange(e.target.value)}
              onBlur={(e) => commitTopLeaderboard(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
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
            <button className="btn ghost" onClick={exportLeaderboardCsv}>
              Export CSV
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
                <SortTh sortable={leaderboardSort} sortKey="wvwGuildName">WvW Guild</SortTh>
                <SortTh sortable={leaderboardSort} sortKey="allianceGuildName">Alliance Guild</SortTh>
                <SortTh sortable={leaderboardSort} sortKey="weeklyKills">Weekly Kills</SortTh>
                <SortTh sortable={leaderboardSort} sortKey="totalKills">Total Kills</SortTh>
              </tr>
            </thead>
            <tbody>
              {initialLoading
                ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} cols={6} />)
                : leaderboardVisibleRows.map((item) => (
                    <tr key={`${item.rank}-${item.accountName}`}>
                      <td>{item.rank}.</td>
                      <td>{item.accountName}</td>
                      <td>{formatGuildCell(item.wvwGuildName, item.wvwGuildTag)}</td>
                      <td>{formatGuildCell(item.allianceGuildName, item.allianceGuildTag)}</td>
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
