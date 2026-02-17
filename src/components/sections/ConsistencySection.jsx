import { ErrorBoundary } from "../ErrorBoundary";
import { SortTh } from "../SortTh";
import { fmtNumber } from "../../utils";

export function ConsistencySection({
  consistencyTop,
  setConsistencyTop,
  consistencySort,
}) {
  return (
    <ErrorBoundary name="Consistency Score">
      <section className="card" id="consistency">
        <div className="section-head">
          <h2>Consistency Score</h2>
          <div className="toolbar compact">
            <span className="muted">Top</span>
            <input
              type="number"
              min={5}
              max={100}
              value={consistencyTop}
              onChange={(e) => setConsistencyTop(Math.max(5, Math.min(100, Number(e.target.value || 20))))}
            />
          </div>
        </div>
        <p className="muted">
          Score favors steady snapshot-to-snapshot weekly gains (higher = more consistent).
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh sortable={consistencySort} sortKey="accountName">Account</SortTh>
                <SortTh sortable={consistencySort} sortKey="consistencyScore">Score</SortTh>
                <SortTh sortable={consistencySort} sortKey="avgDelta">Avg Delta</SortTh>
                <SortTh sortable={consistencySort} sortKey="stddevDelta">Std Dev</SortTh>
                <SortTh sortable={consistencySort} sortKey="activeIntervals">Active Intervals</SortTh>
                <SortTh sortable={consistencySort} sortKey="totalGain">Total Gain</SortTh>
              </tr>
            </thead>
            <tbody>
              {consistencySort.sorted.map((row) => (
                <tr key={`consistency-${row.accountName}-${row.sampleSize ?? "na"}-${row.totalGain ?? "na"}`}>
                  <td>{row.accountName}</td>
                  <td>{row.consistencyScore}</td>
                  <td>{fmtNumber(row.avgDelta)}</td>
                  <td>{fmtNumber(row.stddevDelta)}</td>
                  <td>{fmtNumber(row.activeIntervals)}</td>
                  <td>{fmtNumber(row.totalGain)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ErrorBoundary>
  );
}
