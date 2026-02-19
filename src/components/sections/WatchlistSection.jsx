import { useEffect, useState } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { SortTh } from "../SortTh";
import { fmtNumber } from "../../utils";

export function WatchlistSection({
  effectiveWatchlistAccounts,
  removeWatchlistAccount,
  watchlistInput,
  handleWatchlistInputChange,
  watchlistSuggestions,
  addWatchlistAccount,
  watchlistMinGain,
  setWatchlistMinGain,
  watchlistMinRankUp,
  setWatchlistMinRankUp,
  watchlistSort,
}) {
  const [watchlistMinGainDraft, setWatchlistMinGainDraft] = useState(String(watchlistMinGain));
  const [watchlistMinRankUpDraft, setWatchlistMinRankUpDraft] = useState(String(watchlistMinRankUp));

  useEffect(() => {
    setWatchlistMinGainDraft(String(watchlistMinGain));
  }, [watchlistMinGain]);

  useEffect(() => {
    setWatchlistMinRankUpDraft(String(watchlistMinRankUp));
  }, [watchlistMinRankUp]);

  const commitWatchlistMinGain = (rawValue) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setWatchlistMinGainDraft(String(watchlistMinGain));
      return;
    }
    const clamped = Math.max(0, Math.min(5000, Math.floor(parsed)));
    setWatchlistMinGain(clamped);
    setWatchlistMinGainDraft(String(clamped));
  };

  const commitWatchlistMinRankUp = (rawValue) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setWatchlistMinRankUpDraft(String(watchlistMinRankUp));
      return;
    }
    const clamped = Math.max(0, Math.min(200, Math.floor(parsed)));
    setWatchlistMinRankUp(clamped);
    setWatchlistMinRankUpDraft(String(clamped));
  };

  const handleWatchlistMinGainChange = (rawValue) => {
    setWatchlistMinGainDraft(rawValue);
    if (!rawValue) return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return;
    if (parsed < 0 || parsed > 5000) return;
    setWatchlistMinGain(parsed);
  };

  const handleWatchlistMinRankUpChange = (rawValue) => {
    setWatchlistMinRankUpDraft(rawValue);
    if (!rawValue) return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return;
    if (parsed < 0 || parsed > 200) return;
    setWatchlistMinRankUp(parsed);
  };

  return (
    <ErrorBoundary name="Watchlist Alerts">
      <section className="card" id="watchlist">
        <div className="section-head">
          <h2>Watchlist & Alerts</h2>
        </div>
        <div className="toolbar stack compare-controls">
          <div className="tags">
            {effectiveWatchlistAccounts.map((account) => (
              <span key={account} className="tag">
                <span>{account}</span>
                <button type="button" onClick={() => removeWatchlistAccount(account)}>
                  x
                </button>
              </span>
            ))}
          </div>
          <input
            list="watchlistSuggestions"
            value={watchlistInput}
            onChange={(e) => handleWatchlistInputChange(e.target.value)}
            onBlur={(e) => {
              const normalized = e.target.value.trim().toLowerCase();
              if (!normalized) return;
              const matched = watchlistSuggestions.find((s) => s.toLowerCase() === normalized);
              if (matched) addWatchlistAccount(matched);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addWatchlistAccount(watchlistInput);
              }
            }}
            placeholder="Enter account name, then press Enter"
          />
          <datalist id="watchlistSuggestions">
            {watchlistSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="toolbar compact">
            <span className="muted">Alert if weekly gain &gt;=</span>
            <input
              type="number"
              min={0}
              max={5000}
              value={watchlistMinGainDraft}
              onChange={(e) => handleWatchlistMinGainChange(e.target.value)}
              onBlur={(e) => commitWatchlistMinGain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <span className="muted">or rank up &gt;=</span>
            <input
              type="number"
              min={0}
              max={200}
              value={watchlistMinRankUpDraft}
              onChange={(e) => handleWatchlistMinRankUpChange(e.target.value)}
              onBlur={(e) => commitWatchlistMinRankUp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </div>
        </div>
        {!effectiveWatchlistAccounts.length ? (
          <p className="muted">Add accounts to track changes between latest and previous snapshot.</p>
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh sortable={watchlistSort} sortKey="triggered">Alert</SortTh>
                <SortTh sortable={watchlistSort} sortKey="accountName">Account</SortTh>
                <SortTh sortable={watchlistSort} sortKey="latestRank">Rank</SortTh>
                <SortTh sortable={watchlistSort} sortKey="rankChange">Rank Change</SortTh>
                <SortTh sortable={watchlistSort} sortKey="weeklyGain">Weekly Gain</SortTh>
                <SortTh sortable={watchlistSort} sortKey="totalGain">Total Gain</SortTh>
              </tr>
            </thead>
            <tbody>
              {watchlistSort.sorted.map((row) => (
                <tr key={`watchlist-${row.requestedAccount || row.accountName}`}>
                  <td>{row.triggered ? "Triggered" : "-"}</td>
                  <td>{row.found ? row.accountName : `${row.requestedAccount} (not found)`}</td>
                  <td>{row.found ? row.latestRank : "-"}</td>
                  <td>
                    {row.found
                      ? row.rankChange == null
                        ? "-"
                        : `${row.rankChange > 0 ? "+" : ""}${row.rankChange}`
                      : "-"}
                  </td>
                  <td>{row.found ? `${row.weeklyGain > 0 ? "+" : ""}${fmtNumber(row.weeklyGain)}` : "-"}</td>
                  <td>{row.found ? `${row.totalGain > 0 ? "+" : ""}${fmtNumber(row.totalGain)}` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ErrorBoundary>
  );
}
