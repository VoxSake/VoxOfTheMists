import { buildBarChartSvg, buildLineChartSvg } from "./shareReport/charts";
import { esc, list, section, statCards, table } from "./shareReport/primitives";
import { reportCss } from "./shareReport/styles";

const sharedLogoSvg = `
<svg class="brand-logo" viewBox="0 0 252 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="shareDarkMist" x1="6" y1="8" x2="58" y2="48" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#E2E8F0"/>
      <stop offset="1" stop-color="#94A3B8"/>
    </linearGradient>
    <linearGradient id="shareDarkAccent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22D3EE"/>
      <stop offset="1" stop-color="#60A5FA"/>
    </linearGradient>
  </defs>
  <rect x="3" y="4" width="54" height="48" rx="12" fill="#09090B" stroke="#27272A"/>
  <path d="M10 31C16 24 22 24 28 31C34 38 40 38 50 28" stroke="url(#shareDarkMist)" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M13 22C18 17 24 17 30 22C36 27 42 27 48 22" stroke="#64748B" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="46" cy="17" r="3.4" fill="url(#shareDarkAccent)"/>
  <g fill="#FAFAFA">
    <path d="M74.2 18.1H80L86 34.2L92 18.1H97.7L88.9 39H83L74.2 18.1Z"/>
    <path d="M106.6 39.6C100.3 39.6 95.9 34.8 95.9 28.5C95.9 22.3 100.3 17.5 106.6 17.5C112.9 17.5 117.3 22.3 117.3 28.5C117.3 34.8 112.9 39.6 106.6 39.6ZM106.6 34.8C109.8 34.8 112.1 32.2 112.1 28.5C112.1 24.9 109.8 22.3 106.6 22.3C103.4 22.3 101.1 24.9 101.1 28.5C101.1 32.2 103.4 34.8 106.6 34.8Z"/>
    <path d="M118.8 18.1H124.6L129 24.5L133.4 18.1H139.1L132 28.2L139.3 39H133.4L129 32.4L124.4 39H118.6L126 28.2L118.8 18.1Z"/>
  </g>
  <text x="145" y="36" fill="#94A3B8" font-size="10.5" font-family="Inter,Segoe UI,Arial,sans-serif" letter-spacing="0.16em">OF THE MISTS</text>
</svg>`;

export function buildSnapshotHtml(snapshot) {
  const generatedAt = esc(snapshot.generatedAt || "-");
  const timezone = esc(snapshot.timeZone || "UTC");
  const title = snapshot.title || `Vox of the Mists - Report - ${generatedAt}`;

  const kpis = section(
    "Overview Cards",
    statCards([
      { label: "Latest Snapshot", value: snapshot.overview.latestSnapshot || "-" },
      { label: "Next Snapshot", value: snapshot.overview.nextSnapshot || "-" },
      { label: "Ingestion", value: snapshot.overview.ingestionStatus || "-" },
      { label: "Last Run", value: snapshot.overview.lastRun || "-" },
      { label: "Storage", value: snapshot.overview.storage || "-" },
      { label: "Week Reset", value: snapshot.overview.weekReset || "-" },
      { label: "Velocity", value: snapshot.overview.velocity || "-" },
      { label: "Share Preset", value: snapshot.overview.sharePreset || "Full detail" },
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
      <div class="brand-wrap">
        ${sharedLogoSvg}
        <p class="eyebrow">Shared Report</p>
        <h1>${esc(snapshot.title || "Vox of the Mists - Shared Report")}</h1>
        <p class="muted">Built from your current dashboard filters and selected timezone.</p>
      </div>
      <p class="meta muted">Generated at ${generatedAt}<br/>Timezone: ${timezone}</p>
    </header>
    ${kpis}
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
