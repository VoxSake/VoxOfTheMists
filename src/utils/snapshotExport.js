function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function section(title, body) {
  return `<section class="card"><h2>${esc(title)}</h2>${body}</section>`;
}

function list(items) {
  if (!items?.length) return `<p class="muted">No data.</p>`;
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function table(headers, rows, tableId) {
  if (!rows?.length) return `<p class="muted">No rows.</p>`;
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="table-wrap" data-paginated="1" data-table-id="${esc(tableId)}"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function buildSnapshotHtml(snapshot) {
  const generatedAt = esc(snapshot.generatedAt || "-");
  const timezone = esc(snapshot.timeZone || "UTC");
  const title = `Vox of the Mists - Snapshot - ${generatedAt}`;

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
    ])
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
      ])
      ,
      nextTableId("movers")
    )
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
      ])
      ,
      nextTableId("consistency")
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
        "Night",
        "Morning",
        "Afternoon",
        "Primetime",
        "Evening",
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
        s.deltas.Night,
        s.deltas.Morning,
        s.deltas.Afternoon,
        s.deltas.Primetime,
        s.deltas.Evening,
      ]),
      nextTableId("compare-summary")
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

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 20px; background: #0f1217; color: #e7edf6; }
    h1 { margin: 0 0 8px; }
    h2 { margin: 0 0 10px; font-size: 18px; }
    p { margin: 6px 0; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 6px 0; }
    .muted { color: #9eb0c6; }
    .card { border: 1px solid #2c3746; border-radius: 10px; padding: 14px; margin: 12px 0; background: #161d28; }
    .table-wrap { overflow: auto; border: 1px solid #273243; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #273243; text-align: left; white-space: nowrap; }
    th { background: #1e2735; position: sticky; top: 0; }
    .meta { margin-bottom: 12px; }
    .pager { display: flex; align-items: center; gap: 8px; margin: 10px 0 2px; }
    .pager button { background: #1e2735; color: #e7edf6; border: 1px solid #2c3746; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
    .pager button:disabled { opacity: .45; cursor: default; }
  </style>
</head>
<body>
  <h1>Vox of the Mists - Shared Snapshot</h1>
  <p class="meta muted">Generated at ${generatedAt} (${timezone})</p>
  <p class="muted">Static export of current dashboard state. Charts are omitted in this HTML report.</p>
  ${overview}
  ${leaderboard}
  ${movers}
  ${anomalies}
  ${resetImpact}
  ${consistency}
  ${compareProjection}
  ${compareSummaries}
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
