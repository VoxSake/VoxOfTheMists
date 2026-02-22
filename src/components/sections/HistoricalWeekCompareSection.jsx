import { ErrorBoundary } from "../ErrorBoundary";

export function HistoricalWeekCompareSection({
  weekOptions,
  weekA,
  weekB,
  setWeekA,
  setWeekB,
  hasArchivedWeeks,
  loading,
  error,
  summaryA,
  summaryB,
  comparisonRows,
}) {
  return (
    <ErrorBoundary name="Historical Week Compare">
      <section className="card" id="week-compare">
        <div className="section-head">
          <h2>Week Comparison</h2>
          <div className="toolbar compact">
            <select value={weekA} onChange={(e) => setWeekA(e.target.value)}>
              {weekOptions.map((w) => (
                <option key={`a-${w.weekEndUtc}`} value={w.weekEndUtc}>
                  A: {w.label}
                </option>
              ))}
            </select>
            <select value={weekB} onChange={(e) => setWeekB(e.target.value)}>
              {weekOptions.map((w) => (
                <option key={`b-${w.weekEndUtc}`} value={w.weekEndUtc}>
                  B: {w.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!hasArchivedWeeks ? <p className="muted">No archived week windows yet. You can still compare against Current Week.</p> : null}
        {loading ? <p className="muted">Loading weekly comparison...</p> : null}
        {error ? <p className="muted">Comparison unavailable: {error}</p> : null}

        {summaryA && summaryB ? (
          <div className="summary-grid">
            <article className="summary-card">
              <p className="summary-account">Week A</p>
              <p className="summary-main">{summaryA.label}</p>
              <p className="summary-breakdown">Top mover: {summaryA.topMover || "-"}</p>
            </article>
            <article className="summary-card">
              <p className="summary-account">Week B</p>
              <p className="summary-main">{summaryB.label}</p>
              <p className="summary-breakdown">Top mover: {summaryB.topMover || "-"}</p>
            </article>
          </div>
        ) : null}

        {comparisonRows?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Week A</th>
                  <th>Week B</th>
                  <th>B - A</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.metric}>
                    <td>{row.metric}</td>
                    <td>{row.a}</td>
                    <td>{row.b}</td>
                    <td>{row.diff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </ErrorBoundary>
  );
}
