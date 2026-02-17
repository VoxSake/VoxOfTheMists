import { ErrorBoundary } from "../ErrorBoundary";
import { SortTh } from "../SortTh";
import { fmtNumber, formatTimestamp } from "../../utils";

export function RankMoversSection({
  deltaMetric,
  setDeltaMetric,
  showTotalDelta,
  setShowTotalDelta,
  moversPageSize,
  setMoversPageSize,
  topDelta,
  setTopDelta,
  exportDeltaCsv,
  scope,
  deltaPayload,
  timeZone,
  movers,
  moversStartIndex,
  moversEndIndex,
  moversTotalRows,
  clampedMoversPage,
  moversTotalPages,
  onPrevPage,
  onNextPage,
  deltaSort,
  moversVisibleRows,
}) {
  return (
    <ErrorBoundary name="Rank Movers">
      <section className="card" id="movers">
        <div className="section-head">
          <h2>Rank Movers</h2>
          <div className="toolbar compact">
            <select value={deltaMetric} onChange={(e) => setDeltaMetric(e.target.value)}>
              <option value="weeklyKills">Sort by Weekly Delta</option>
              <option value="totalKills">Sort by Total Delta</option>
            </select>
            <label className="check-inline">
              <input type="checkbox" checked={showTotalDelta} onChange={(e) => setShowTotalDelta(e.target.checked)} />
              Show Total Delta
            </label>
            <input
              type="number"
              min={5}
              max={200}
              value={topDelta}
              onChange={(e) => setTopDelta(Math.max(5, Math.min(200, Number(e.target.value || 30))))}
            />
            <select
              value={moversPageSize}
              onChange={(e) => setMoversPageSize(Math.max(10, Math.min(100, Number(e.target.value || 50))))}
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button className="btn ghost" onClick={exportDeltaCsv}>
              CSV
            </button>
          </div>
        </div>
        {scope === "week" && deltaPayload?.weekWindow ? (
          <p className="muted">
            Week window: {formatTimestamp(deltaPayload.weekWindow.startUtc, timeZone)} -{" "}
            {formatTimestamp(deltaPayload.weekWindow.endUtc, timeZone)}
          </p>
        ) : null}
        <div className="leaderboard-pagination">
          <p className="muted">
            Showing {moversStartIndex}-{moversEndIndex} of {moversTotalRows} rows
          </p>
          <div className="toolbar compact">
            <button className="btn ghost" disabled={clampedMoversPage <= 1} onClick={onPrevPage}>
              Prev
            </button>
            <span className="muted">
              Page {clampedMoversPage} / {moversTotalPages}
            </span>
            <button className="btn ghost" disabled={clampedMoversPage >= moversTotalPages} onClick={onNextPage}>
              Next
            </button>
          </div>
        </div>
        <div className="summary-grid movers-grid">
          <article className="summary-card">
            <p className="summary-account">Biggest Climbers</p>
            {movers.climbers.length ? (
              <p className="summary-breakdown">
                {movers.climbers.map((r) => `${r.accountName} (${r.rankChange > 0 ? "+" : ""}${r.rankChange})`).join(" | ")}
              </p>
            ) : (
              <p className="summary-breakdown">No rank movers yet.</p>
            )}
          </article>
          <article className="summary-card">
            <p className="summary-account">Biggest Decliners</p>
            {movers.decliners.length ? (
              <p className="summary-breakdown">
                {movers.decliners.map((r) => `${r.accountName} (${r.rankChange > 0 ? "+" : ""}${r.rankChange})`).join(" | ")}
              </p>
            ) : (
              <p className="summary-breakdown">No rank decliners yet.</p>
            )}
          </article>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh sortable={deltaSort} sortKey="latestRank">Rank</SortTh>
                <SortTh sortable={deltaSort} sortKey="previousRank">Prev Rank</SortTh>
                <SortTh sortable={deltaSort} sortKey="rankChange">Rank Change</SortTh>
                <SortTh sortable={deltaSort} sortKey="accountName">Account</SortTh>
                <SortTh sortable={deltaSort} sortKey="weeklyKillsDelta">Weekly Delta</SortTh>
                {showTotalDelta ? <SortTh sortable={deltaSort} sortKey="totalKillsDelta">Total Delta</SortTh> : null}
              </tr>
            </thead>
            <tbody>
              {moversVisibleRows.map((row) => (
                <tr key={`delta-${row.latestRank}-${row.accountName}-${row.previousRank ?? "na"}`}>
                  <td>{row.latestRank}</td>
                  <td>{row.previousRank ?? "-"}</td>
                  <td>{row.rankChange == null ? "-" : row.rankChange > 0 ? `+${row.rankChange}` : row.rankChange}</td>
                  <td>{row.accountName}</td>
                  <td>{row.weeklyKillsDelta > 0 ? "+" : ""}{fmtNumber(row.weeklyKillsDelta)}</td>
                  {showTotalDelta ? <td>{row.totalKillsDelta > 0 ? "+" : ""}{fmtNumber(row.totalKillsDelta)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ErrorBoundary>
  );
}
