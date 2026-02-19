import { ErrorBoundary } from "../ErrorBoundary";
import { SkeletonRow } from "../Skeleton";
import { fmtNumber } from "../../utils";

function formatGuildCell(name, tag) {
  const n = String(name || "").trim();
  const t = String(tag || "").trim();
  if (n && t) return `${n} [${t}]`;
  return n || t || "-";
}

export function GuildCheckSection({
  query,
  setQuery,
  region,
  setRegion,
  running,
  onRun,
  status,
  rows,
  page,
  pageSize,
  setPageSize,
  onPrevPage,
  onNextPage,
}) {
  const pagination = status?.pagination || { page: 1, totalPages: 1, totalRows: 0, startIndex: 0, endIndex: 0 };
  return (
    <ErrorBoundary name="Guild Check">
      <section className="card" id="guild-check">
        <div className="section-head">
          <h2>Guild Check</h2>
          <div className="toolbar">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onRun();
                }
              }}
              placeholder="Guild/alliance search (e.g. iKuy, Mistwalk)"
            />
            <select value={region} onChange={(e) => setRegion(e.target.value === "na" ? "na" : "eu")}>
              <option value="eu">EU</option>
              <option value="na">NA</option>
            </select>
            <button className="btn btn-snapshot" disabled={running || !String(query || "").trim()} onClick={onRun}>
              {running ? "Searching..." : "Run Search"}
            </button>
          </div>
        </div>
        <p className="muted">
          {status
            ? `Status: ${status.status} | Query: "${status.query}" | Region: ${status.region.toUpperCase()} | Progress: ${status.pagesFetched || 0}/${status.pagesTotal || "?"} pages | Results: ${fmtNumber(status.resultCount || 0)}`
            : "Runs a background search job and scans all pages for matching players."}
        </p>
        <p className="muted">Search now auto-scans all available pages (up to server safety cap).</p>
        <div className="leaderboard-pagination">
          <p className="muted">
            Showing {pagination.startIndex}-{pagination.endIndex} of {pagination.totalRows} rows
          </p>
          <div className="toolbar compact">
            <select value={pageSize} onChange={(e) => setPageSize(Math.max(10, Math.min(200, Number(e.target.value || 50))))}>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button className="btn ghost" disabled={page <= 1} onClick={onPrevPage}>
              Prev
            </button>
            <span className="muted">
              Page {page} / {pagination.totalPages}
            </span>
            <button className="btn ghost" disabled={page >= pagination.totalPages} onClick={onNextPage}>
              Next
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Account</th>
                <th>Team</th>
                <th>WvW Guild</th>
                <th>Alliance Guild</th>
                <th>Weekly Kills</th>
                <th>Total Kills</th>
              </tr>
            </thead>
            <tbody>
              {running && !rows.length
                ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} cols={7} />)
                : rows.map((row) => (
                    <tr key={`guild-check-${row.rank}-${row.accountName}`}>
                      <td>{row.rank}</td>
                      <td>{row.accountName}</td>
                      <td>{row.teamName || "-"}</td>
                      <td>{formatGuildCell(row.wvwGuildName, row.wvwGuildTag)}</td>
                      <td>{formatGuildCell(row.allianceGuildName, row.allianceGuildTag)}</td>
                      <td>{fmtNumber(row.weeklyKills)}</td>
                      <td>{fmtNumber(row.totalKills)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>
    </ErrorBoundary>
  );
}
