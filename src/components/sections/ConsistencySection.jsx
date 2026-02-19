import { useEffect, useState } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { SortTh } from "../SortTh";
import { fmtNumber } from "../../utils";

export function ConsistencySection({
  consistencyTop,
  setConsistencyTop,
  consistencySort,
}) {
  const [consistencyTopDraft, setConsistencyTopDraft] = useState(String(consistencyTop));

  useEffect(() => {
    setConsistencyTopDraft(String(consistencyTop));
  }, [consistencyTop]);

  const commitConsistencyTop = (rawValue) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setConsistencyTopDraft(String(consistencyTop));
      return;
    }
    const clamped = Math.max(5, Math.min(100, Math.floor(parsed)));
    setConsistencyTop(clamped);
    setConsistencyTopDraft(String(clamped));
  };

  const handleConsistencyTopChange = (rawValue) => {
    setConsistencyTopDraft(rawValue);
    if (!rawValue) return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return;
    if (parsed < 5 || parsed > 100) return;
    setConsistencyTop(parsed);
  };

  return (
    <ErrorBoundary name="Consistency Score">
      <section className="card" id="consistency">
        <div className="section-head">
          <h2>Consistency Score</h2>
          <div className="toolbar compact">
            <span className="muted">Top Accounts</span>
            <input
              type="number"
              min={5}
              max={100}
              value={consistencyTopDraft}
              onChange={(e) => handleConsistencyTopChange(e.target.value)}
              onBlur={(e) => commitConsistencyTop(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
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
