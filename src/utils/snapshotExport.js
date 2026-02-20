import { buildBarChartSvg, buildLineChartSvg } from "./shareReport/charts";
import { esc, list, section, statCards, table } from "./shareReport/primitives";
import { reportCss } from "./shareReport/styles";

export function buildSnapshotHtml(snapshot) {
  const generatedAt = esc(snapshot.generatedAt || "-");
  const timezone = esc(snapshot.timeZone || "UTC");
  const title = snapshot.title || `Vox of the Mists - Report - ${generatedAt}`;

  const overview = section(
    "Overview",
    list([
      `<strong>Timezone:</strong> ${timezone}`,
      `<strong>Latest snapshot:</strong> ${esc(snapshot.overview.latestSnapshot)}`,
      `<strong>Next snapshot:</strong> ${esc(snapshot.overview.nextSnapshot)}`,
      `<strong>Ingestion:</strong> ${esc(snapshot.overview.ingestionStatus)}`,
      `<strong>Last run:</strong> ${esc(snapshot.overview.lastRun)}`,
      `<strong>Storage:</strong> ${esc(snapshot.overview.storage)}`,
      `<strong>Week reset:</strong> ${esc(snapshot.overview.weekReset)}`,
      `<strong>Velocity:</strong> ${esc(snapshot.overview.velocity)}`,
    ]),
    "Operational snapshot for current filters and timezone."
  );

  const kpis = section(
    "Highlights",
    statCards([
      { label: "Snapshots", value: String(snapshot.overview.storage || "-").split("|")[0]?.trim() || "-" },
      { label: "Latest Snapshot", value: String(snapshot.overview.latestSnapshot || "-").split("|")[0]?.trim() || "-" },
      { label: "Ingestion", value: snapshot.overview.ingestionStatus || "-" },
      { label: "Top Projection", value: snapshot.compareProjectionLeader || "-" },
    ])
  );

  const charts = section(
    "Charts",
    `<div class="chart-grid">
      ${buildLineChartSvg(snapshot?.charts?.progressionWeekly?.series || [], {
        title: snapshot?.charts?.progressionWeekly?.title || "Top Progression",
      })}
      ${buildLineChartSvg(snapshot?.charts?.compareWeekly?.series || [], {
        title: snapshot?.charts?.compareWeekly?.title || "Compare Accounts",
      })}
      ${buildBarChartSvg(snapshot?.charts?.moversWeeklyDelta?.rows || [], {
        title: snapshot?.charts?.moversWeeklyDelta?.title || "Top Movers",
      })}
    </div>`,
    "Dashed segments in Compare Accounts indicate projected kills to week end."
  );

  let tableSeq = 0;
  const nextTableId = (name) => `${name}-${tableSeq++}`;

  const leaderboard = section(
    "Leaderboard",
    table(
      ["Rank", "Account", "Weekly Kills", "Total Kills"],
      (snapshot.leaderboard || []).map((r) => [r.rank, r.accountName, r.weeklyKills, r.totalKills]),
      nextTableId("leaderboard")
    )
  );

  const movers = section(
    "Rank Movers",
    table(
      ["Rank", "Prev Rank", "Rank Change", "Account", "Weekly Delta", "Total Delta"],
      (snapshot.movers || []).map((r) => [
        r.latestRank,
        r.previousRank ?? "-",
        r.rankChange ?? "-",
        r.accountName,
        r.weeklyKillsDelta,
        r.totalKillsDelta,
      ]),
      nextTableId("movers")
    ),
    "Computed from the latest snapshot versus the immediately previous snapshot."
  );

  const anomalies = section(
    "Anomaly Alerts",
    table(
      ["Time", "Account", "Type", "Latest Delta", "Baseline", "Deviation"],
      (snapshot.anomalies || []).map((r) => [
        r.createdAt,
        r.accountName,
        r.direction || "-",
        r.latestDelta,
        r.baselineAvg,
        `${r.deviation} (${r.deviationPct}%)`,
      ]),
      nextTableId("anomalies")
    )
  );

  const resetImpact = section(
    "Reset Impact",
    table(
      ["Account", "Start Rank", "End Rank", "Rank Gain", "Weekly Gain", "Total Gain"],
      (snapshot.resetImpact || []).map((r) => [r.accountName, r.startRank, r.endRank, r.rankGain, r.gain, r.totalGain]),
      nextTableId("reset-impact")
    )
  );

  const consistency = section(
    "Consistency",
    table(
      ["Account", "Score", "Avg Delta", "Std Dev", "Active Intervals", "Total Gain"],
      (snapshot.consistency || []).map((r) => [
        r.accountName,
        r.consistencyScore,
        r.avgDelta,
        r.stddevDelta,
        r.activeIntervals,
        r.totalGain,
      ]),
      nextTableId("consistency")
    )
  );

  const compareProjection = section(
    "Current Week Projection",
    list([`<strong>Projected leader:</strong> ${esc(snapshot.compareProjectionLeader || "-")}`]) +
      table(
        ["Account", "Avg Kills/h", "Weekly Gain", "Projected +", "Projected At Reset"],
        (snapshot.compareProjection || []).map((r) => [
          r.account,
          r.avgKillsPerHour,
          r.weeklyKillsGain,
          r.projectedGain,
          r.projectedWeeklyAtReset,
        ]),
        nextTableId("compare-projection")
      )
  );

  const compareSummaries = section(
    "Compare Activity Summary",
    table(
      [
        "Account",
        "Dominant Segment",
        "Confidence",
        "Total Hours",
        "Avg Kills/h",
        "Weekly Gain",
        "Projected +",
        "Projected At Reset",
        "Hours/Day",
      ],
      (snapshot.compareSummaries || []).map((s) => [
        s.account,
        s.dominant,
        `${s.confidence}%`,
        s.totalHours ?? 0,
        s.avgKillsPerHour ?? "-",
        s.weeklyKillsGain ?? "-",
        s.projectedWeeklyGain ?? "-",
        s.projectedWeeklyAtReset ?? "-",
        `Fri ${s.hoursByDay?.Friday ?? 0}h | Sat ${s.hoursByDay?.Saturday ?? 0}h | Sun ${s.hoursByDay?.Sunday ?? 0}h | Mon ${s.hoursByDay?.Monday ?? 0}h | Tue ${s.hoursByDay?.Tuesday ?? 0}h | Wed ${s.hoursByDay?.Wednesday ?? 0}h | Thu ${s.hoursByDay?.Thursday ?? 0}h`,
      ]),
      nextTableId("compare-summary")
    )
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>${reportCss}</style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Shared Report</p>
        <h1>${esc(snapshot.title || "Vox of the Mists - Shared Report")}</h1>
      </div>
      <p class="meta muted">Generated at ${generatedAt} (${timezone})</p>
    </header>
    ${kpis}
    ${overview}
    ${charts}
    ${leaderboard}
    ${movers}
    ${anomalies}
    ${resetImpact}
    ${consistency}
    ${compareProjection}
    ${compareSummaries}
  </div>
  <script>
    (() => {
      const pageSize = 30;
      const wraps = Array.from(document.querySelectorAll('.table-wrap[data-paginated="1"]'));
      for (const wrap of wraps) {
        const tbody = wrap.querySelector('tbody');
        if (!tbody) continue;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (rows.length <= pageSize) continue;

        const pager = document.createElement('div');
        pager.className = 'pager';
        const prev = document.createElement('button');
        prev.textContent = 'Prev';
        const next = document.createElement('button');
        next.textContent = 'Next';
        const label = document.createElement('span');
        label.className = 'muted';
        pager.append(prev, label, next);
        wrap.insertAdjacentElement('afterend', pager);

        let page = 1;
        const pages = Math.max(1, Math.ceil(rows.length / pageSize));
        const render = () => {
          const start = (page - 1) * pageSize;
          const end = start + pageSize;
          rows.forEach((row, i) => {
            row.style.display = i >= start && i < end ? '' : 'none';
          });
          prev.disabled = page <= 1;
          next.disabled = page >= pages;
          label.textContent = 'Page ' + page + ' / ' + pages + ' (' + rows.length + ' rows)';
        };

        prev.addEventListener('click', () => {
          if (page > 1) {
            page -= 1;
            render();
          }
        });
        next.addEventListener('click', () => {
          if (page < pages) {
            page += 1;
            render();
          }
        });
        render();
      }
    })();
  </script>
</body>
</html>`;
}
