import { useEffect, useState } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { SortTh } from "../SortTh";
import { fmtNumber, formatTimestamp } from "../../utils";

export function AnomaliesSection({
  anomalyMinDelta,
  setAnomalyMinDelta,
  anomaliesPageSize,
  setAnomaliesPageSize,
  exportAnomaliesCsv,
  anomalySort,
  timeZone,
  anomaliesStartIndex,
  anomaliesEndIndex,
  anomaliesTotalRows,
  clampedAnomaliesPage,
  anomaliesTotalPages,
  onPrevPage,
  onNextPage,
  anomaliesVisibleRows,
}) {
  const [anomalyMinDraft, setAnomalyMinDraft] = useState(String(anomalyMinDelta));

  useEffect(() => {
    setAnomalyMinDraft(String(anomalyMinDelta));
  }, [anomalyMinDelta]);

  const commitAnomalyMinDelta = (rawValue) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setAnomalyMinDraft(String(anomalyMinDelta));
      return;
    }
    const clamped = Math.max(10, Math.min(5000, Math.floor(parsed)));
    setAnomalyMinDelta(clamped);
    setAnomalyMinDraft(String(clamped));
  };

  const handleAnomalyMinChange = (rawValue) => {
    setAnomalyMinDraft(rawValue);
    if (!rawValue) return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return;
    if (parsed < 10 || parsed > 5000) return;
    setAnomalyMinDelta(parsed);
  };

  return (
    <ErrorBoundary name="Anomaly Alerts">
      <section className="card" id="anomalies">
        <div className="section-head">
          <h2>Anomaly Alerts</h2>
          <div className="toolbar compact">
            <label className="muted" htmlFor="anomalyMin">Min Absolute Deviation</label>
            <input
              id="anomalyMin"
              type="number"
              min={10}
              max={5000}
              value={anomalyMinDraft}
              onChange={(e) => handleAnomalyMinChange(e.target.value)}
              onBlur={(e) => commitAnomalyMinDelta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <select
              value={anomaliesPageSize}
              onChange={(e) => setAnomaliesPageSize(Math.max(10, Math.min(100, Number(e.target.value || 50))))}
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button className="btn ghost" onClick={exportAnomaliesCsv}>
              Export CSV
            </button>
          </div>
        </div>
        <div className="leaderboard-pagination">
          <p className="muted">
            Showing {anomaliesStartIndex}-{anomaliesEndIndex} of {anomaliesTotalRows} rows
          </p>
          <div className="toolbar compact">
            <button className="btn ghost" disabled={clampedAnomaliesPage <= 1} onClick={onPrevPage}>
              Prev
            </button>
            <span className="muted">
              Page {clampedAnomaliesPage} / {anomaliesTotalPages}
            </span>
            <button className="btn ghost" disabled={clampedAnomaliesPage >= anomaliesTotalPages} onClick={onNextPage}>
              Next
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh sortable={anomalySort} sortKey="createdAt">Time</SortTh>
                <SortTh sortable={anomalySort} sortKey="accountName">Account</SortTh>
                <SortTh sortable={anomalySort} sortKey="direction">Direction</SortTh>
                <SortTh sortable={anomalySort} sortKey="latestDelta">Latest Delta</SortTh>
                <SortTh sortable={anomalySort} sortKey="baselineAvg">Baseline</SortTh>
                <SortTh sortable={anomalySort} sortKey="deviation">Deviation</SortTh>
              </tr>
            </thead>
            <tbody>
              {anomaliesVisibleRows.map((row) => (
                <tr key={`anomaly-${row.accountName}-${row.createdAt}`}>
                  <td>{formatTimestamp(row.createdAt, timeZone)}</td>
                  <td>{row.accountName}</td>
                  <td>{row.direction ? row.direction.charAt(0).toUpperCase() + row.direction.slice(1) : "-"}</td>
                  <td>{row.latestDelta > 0 ? "+" : ""}{fmtNumber(row.latestDelta)}</td>
                  <td>{fmtNumber(row.baselineAvg)}</td>
                  <td>{row.deviation > 0 ? "+" : ""}{fmtNumber(row.deviation)} ({row.deviationPct > 0 ? "+" : ""}{row.deviationPct}%)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ErrorBoundary>
  );
}
