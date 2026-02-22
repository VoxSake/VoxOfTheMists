import { ErrorBoundary } from "../ErrorBoundary";

export function NarrativeInsightsSection({ insights }) {
  const compactInsights = Array.isArray(insights) ? insights.slice(0, 4) : [];

  return (
    <ErrorBoundary name="Narrative Insights">
      <section className="card" id="insights">
        <div className="section-head">
          <h2>Narrative Insights</h2>
        </div>
        {!compactInsights.length ? <p className="muted">Insights will appear as soon as enough signal is available.</p> : null}

        {compactInsights.length ? (
          <div className="stats-grid insights-grid">
            {compactInsights.map((insight) => (
              <article key={insight.id} className="stat-card insight-stat-card">
                <p className="stat-label">{insight.title}</p>
                <p className="stat-value insight-value">{insight.body}</p>
                {insight.note ? <p className="stat-subtle">{insight.note}</p> : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </ErrorBoundary>
  );
}
