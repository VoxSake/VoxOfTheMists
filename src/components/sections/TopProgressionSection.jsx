import { lazy, Suspense } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { METRIC_OPTIONS, TOP_OPTIONS, SCOPE_OPTIONS, formatTimestamp } from "../../utils";

const LineChart = lazy(() => import("../LineChart").then((m) => ({ default: m.LineChart })));

export function TopProgressionSection({
  topProgression,
  setTopProgression,
  metric,
  setMetric,
  scope,
  setScope,
  allTimeRange,
  setAllTimeRange,
  progressionPayload,
  timeZone,
  filteredProgressionPayload,
  themeDark,
}) {
  return (
    <ErrorBoundary name="Top Progression">
      <section className="card" id="progression">
        <div className="section-head">
          <h2>Top Progression</h2>
          <div className="toolbar compact">
            <select value={topProgression} onChange={(e) => setTopProgression(Number(e.target.value))}>
              {TOP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  Top {opt}
                </option>
              ))}
            </select>
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {METRIC_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              {SCOPE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
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
        {scope === "week" && progressionPayload?.weekWindow ? (
          <p className="muted">
            Week window: {formatTimestamp(progressionPayload.weekWindow.startUtc, timeZone)} -{" "}
            {formatTimestamp(progressionPayload.weekWindow.endUtc, timeZone)}
          </p>
        ) : null}
        {scope === "all" ? (
          <p className="muted">
            Loaded range:{" "}
            {allTimeRange === "full" ? "From first snapshot" : allTimeRange === "90d" ? "Recent 90 days" : "Recent 30 days"}
          </p>
        ) : null}
        <div className="chart-area chart-area-large">
          <Suspense
            fallback={
              <div className="chart-empty-state">
                <p>Loading chart...</p>
              </div>
            }
          >
            <LineChart payload={filteredProgressionPayload} metric={metric} timeZone={timeZone} themeDark={themeDark} />
          </Suspense>
        </div>
      </section>
    </ErrorBoundary>
  );
}
