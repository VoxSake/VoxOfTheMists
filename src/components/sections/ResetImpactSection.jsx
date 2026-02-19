import { ErrorBoundary } from "../ErrorBoundary";
import { SortTh } from "../SortTh";
import { fmtNumber, formatTimestamp } from "../../utils";

export function ResetImpactSection({
  resetImpactWindow,
  setResetImpactWindow,
  resetImpactPayload,
  timeZone,
  resetImpactSort,
}) {
  return (
    <ErrorBoundary name="Reset Impact">
      <section className="card" id="reset-impact">
        <div className="section-head">
          <h2>Reset Impact</h2>
          <div className="toolbar compact">
            <span className="muted">Reset Window</span>
            <select value={resetImpactWindow} onChange={(e) => setResetImpactWindow(Number(e.target.value))}>
              <option value={1}>First 1h</option>
              <option value={3}>First 3h</option>
              <option value={6}>First 6h</option>
            </select>
          </div>
        </div>
        {resetImpactPayload?.base && resetImpactPayload?.target ? (
          <p className="muted">
            From {formatTimestamp(resetImpactPayload.base.createdAt, timeZone)} to{" "}
            {formatTimestamp(resetImpactPayload.target.createdAt, timeZone)} ({timeZone})
          </p>
        ) : (
          <p className="muted">Not enough snapshots yet in current reset window.</p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh sortable={resetImpactSort} sortKey="accountName">Account</SortTh>
                <SortTh sortable={resetImpactSort} sortKey="startRank">Start Rank</SortTh>
                <SortTh sortable={resetImpactSort} sortKey="endRank">End Rank</SortTh>
                <SortTh sortable={resetImpactSort} sortKey="rankGain">Rank Gain</SortTh>
                <SortTh sortable={resetImpactSort} sortKey="gain">Weekly Gain</SortTh>
                <SortTh sortable={resetImpactSort} sortKey="totalGain">Total Gain</SortTh>
              </tr>
            </thead>
            <tbody>
              {resetImpactSort.sorted.map((row) => (
                <tr key={`reset-impact-${row.startRank}-${row.endRank}-${row.accountName}`}>
                  <td>{row.accountName}</td>
                  <td>{row.startRank}</td>
                  <td>{row.endRank}</td>
                  <td>{row.rankGain > 0 ? "+" : ""}{row.rankGain}</td>
                  <td>{row.gain > 0 ? "+" : ""}{fmtNumber(row.gain)}</td>
                  <td>{row.totalGain > 0 ? "+" : ""}{fmtNumber(row.totalGain)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ErrorBoundary>
  );
}
