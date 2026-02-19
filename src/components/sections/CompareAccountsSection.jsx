import { lazy, Suspense } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { fmtNumber, formatTimestamp, metricLabel } from "../../utils";
import { useWeeklyProjection } from "../../hooks/useWeeklyProjection";

const LineChart = lazy(() => import("../LineChart").then((m) => ({ default: m.LineChart })));

export function CompareAccountsSection({
  effectiveCompareAccounts,
  removeCompareAccount,
  compareInput,
  handleCompareInputChange,
  suggestions,
  addCompareAccount,
  setCompareBaseline,
  compareBaseline,
  scope,
  allTimeRange,
  setAllTimeRange,
  comparePayload,
  timeZone,
  filteredComparePayload,
  metric,
  themeDark,
  compareSummaries,
}) {
  const { projection, weeklyProjectionByAccount, sortedCompareSummaries } = useWeeklyProjection({
    scope,
    comparePayload,
    filteredComparePayload,
    metric,
    compareSummaries,
  });

  return (
    <ErrorBoundary name="Compare Accounts">
      <section className="card" id="compare">
        <div className="section-head">
          <h2>Compare Accounts</h2>
        </div>
        <div className="toolbar stack compare-controls">
          <div className="tags">
            {effectiveCompareAccounts.map((account) => (
              <span key={account} className="tag">
                <span>{account}</span>
                <button type="button" onClick={() => removeCompareAccount(account)}>
                  x
                </button>
              </span>
            ))}
          </div>
          <input
            list="accountSuggestions"
            value={compareInput}
            onChange={(e) => handleCompareInputChange(e.target.value)}
            onBlur={(e) => {
              const normalized = e.target.value.trim().toLowerCase();
              if (!normalized) return;
              const matched = suggestions.find((s) => s.toLowerCase() === normalized);
              if (matched) addCompareAccount(matched);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addCompareAccount(compareInput);
              }
            }}
            placeholder="Enter account name, then press Enter"
          />
          <datalist id="accountSuggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="toolbar compact">
            <span className="muted">Chart Baseline</span>
            <select value={compareBaseline} onChange={(e) => setCompareBaseline(e.target.value)}>
              <option value="raw">Absolute Values</option>
              <option value="delta">Delta from Start</option>
              <option value="index100">Indexed (100 at start)</option>
            </select>
            {scope === "all" ? (
              <select value={allTimeRange} onChange={(e) => setAllTimeRange(e.target.value)}>
                <option value="30d">Recent 30d (Fast)</option>
                <option value="90d">Recent 90d</option>
                <option value="full">From First Snapshot</option>
              </select>
            ) : null}
          </div>
        </div>
        {scope === "week" && comparePayload?.weekWindow ? (
          <p className="muted">
            Week window: {formatTimestamp(comparePayload.weekWindow.startUtc, timeZone)} -{" "}
            {formatTimestamp(comparePayload.weekWindow.endUtc, timeZone)}
          </p>
        ) : null}
        {scope === "all" ? (
          <p className="muted">
            Loaded range:{" "}
            {allTimeRange === "full" ? "From first snapshot" : allTimeRange === "90d" ? "Recent 90 days" : "Recent 30 days"}
          </p>
        ) : null}
        {projection ? (
          <div className="activity-summary">
            <h3>Current Week + Projection</h3>
            <p className="muted">
              Projection uses each selected account&apos;s average {metricLabel(metric).toLowerCase()} gain per hour this week, extended
              to {formatTimestamp(projection.endIso, timeZone)}.
            </p>
            {projection.leader ? (
              <p className="muted">
                Projected leader: {projection.leader.account} ({fmtNumber(projection.leader.projectedValue)};{" "}
                {fmtNumber(projection.leader.avgPerHour)}/h)
              </p>
            ) : null}
            <div className="chart-area">
              <Suspense
                fallback={
                  <div className="chart-empty-state">
                    <p>Loading chart...</p>
                  </div>
                }
              >
                <LineChart
                  payload={projection.payload}
                  metric={metric}
                  timeZone={timeZone}
                  themeDark={themeDark}
                  baselineMode="raw"
                />
              </Suspense>
            </div>
          </div>
        ) : (
          <div className="chart-area">
            <Suspense
              fallback={
                <div className="chart-empty-state">
                  <p>Loading chart...</p>
                </div>
              }
            >
              <LineChart
                payload={filteredComparePayload}
                metric={metric}
                timeZone={timeZone}
                themeDark={themeDark}
                baselineMode={compareBaseline}
              />
            </Suspense>
          </div>
        )}
        {compareSummaries.length > 0 ? (
          <div className="activity-summary">
            <h3>Activity Summary (Weekly Kill Deltas)</h3>
            <p className="summary-ranges">
              Time segments (local timezone): Night 00:01-06:00, Morning 06:01-12:00, Afternoon 12:01-20:00, Primetime
              20:01-22:00, Evening 22:01-00:00
            </p>
            <div className="summary-grid">
              {sortedCompareSummaries.map((s) => (
                <article key={s.account} className="summary-card">
                  {(() => {
                    const weeklyStats = weeklyProjectionByAccount[s.account];
                    const totalHours =
                      s.hoursByDay.Friday +
                      s.hoursByDay.Saturday +
                      s.hoursByDay.Sunday +
                      s.hoursByDay.Monday +
                      s.hoursByDay.Tuesday +
                      s.hoursByDay.Wednesday +
                      s.hoursByDay.Thursday;
                    return (
                      <>
                        <p className="summary-account">{s.account}</p>
                        <p className="summary-main">
                          Dominant time segment: <strong>{s.dominant}</strong>
                          {s.confidence > 0 ? ` (${s.confidence}%)` : ""}
                        </p>
                        <div className="summary-line">
                          <span className="summary-label">Kills by segment</span>
                          <div className="summary-chips">
                            {(() => {
                              const segmentValues = [
                                Number(s.deltas.Night || 0),
                                Number(s.deltas.Morning || 0),
                                Number(s.deltas.Afternoon || 0),
                                Number(s.deltas.Primetime || 0),
                                Number(s.deltas.Evening || 0),
                              ];
                              const segmentMax = Math.max(1, ...segmentValues);
                              const segmentTone = (value) => 0.15 + (Math.max(0, Number(value || 0)) / segmentMax) * 0.6;
                              const toneClass = (value) =>
                                `chip-tone-${Math.max(0, Math.min(10, Math.round(segmentTone(value) * 10)))}`;
                              return (
                                <>
                                  <span className={`summary-chip summary-chip-segment ${toneClass(s.deltas.Night)}`}>
                                    Night <strong>{fmtNumber(s.deltas.Night)}</strong>
                                  </span>
                                  <span className={`summary-chip summary-chip-segment ${toneClass(s.deltas.Morning)}`}>
                                    Morning <strong>{fmtNumber(s.deltas.Morning)}</strong>
                                  </span>
                                  <span className={`summary-chip summary-chip-segment ${toneClass(s.deltas.Afternoon)}`}>
                                    Afternoon <strong>{fmtNumber(s.deltas.Afternoon)}</strong>
                                  </span>
                                  <span className={`summary-chip summary-chip-segment ${toneClass(s.deltas.Primetime)}`}>
                                    Primetime <strong>{fmtNumber(s.deltas.Primetime)}</strong>
                                  </span>
                                  <span className={`summary-chip summary-chip-segment ${toneClass(s.deltas.Evening)}`}>
                                    Evening <strong>{fmtNumber(s.deltas.Evening)}</strong>
                                  </span>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="summary-line">
                          <span className="summary-label">Estimated active hours/day</span>
                          <div className="summary-chips">
                            <span className={`summary-chip ${s.hoursByDay.Friday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>
                              Fri <strong>{s.hoursByDay.Friday}h</strong>
                            </span>
                            <span className={`summary-chip ${s.hoursByDay.Saturday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>
                              Sat <strong>{s.hoursByDay.Saturday}h</strong>
                            </span>
                            <span className={`summary-chip ${s.hoursByDay.Sunday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>
                              Sun <strong>{s.hoursByDay.Sunday}h</strong>
                            </span>
                            <span className={`summary-chip ${s.hoursByDay.Monday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>
                              Mon <strong>{s.hoursByDay.Monday}h</strong>
                            </span>
                            <span className={`summary-chip ${s.hoursByDay.Tuesday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>
                              Tue <strong>{s.hoursByDay.Tuesday}h</strong>
                            </span>
                            <span className={`summary-chip ${s.hoursByDay.Wednesday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>
                              Wed <strong>{s.hoursByDay.Wednesday}h</strong>
                            </span>
                            <span className={`summary-chip ${s.hoursByDay.Thursday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>
                              Thu <strong>{s.hoursByDay.Thursday}h</strong>
                            </span>
                            <span className="summary-chip summary-chip-total">
                              Total <strong>{totalHours}h</strong>
                            </span>
                          </div>
                        </div>
                        {weeklyStats ? (
                          <div className="summary-line">
                            <span className="summary-label">Weekly Pace & Projection</span>
                            <div className="summary-chips">
                              <span className="summary-chip">
                                Avg kills/h <strong>{fmtNumber(weeklyStats.avgPerHour)}</strong>
                              </span>
                              <span className="summary-chip">
                                Weekly kills gain <strong>{fmtNumber(weeklyStats.weeklyGain)}</strong>
                              </span>
                              <span className="summary-chip summary-chip-total">
                                Projected at reset{" "}
                                <strong>{fmtNumber(weeklyStats.projectedWeekly)}</strong>{" "}
                                <strong>(+{fmtNumber(weeklyStats.projectedGain)})</strong>
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </ErrorBoundary>
  );
}
