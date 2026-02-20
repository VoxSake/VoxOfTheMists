export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function section(title, body, subtitle = "") {
  return `<section class="card"><h2>${esc(title)}</h2>${subtitle ? `<p class="section-note">${esc(subtitle)}</p>` : ""}${body}</section>`;
}

export function list(items) {
  if (!items?.length) return `<p class="muted">No data.</p>`;
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

export function table(headers, rows, tableId) {
  if (!rows?.length) return `<p class="muted">No rows.</p>`;
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="table-wrap" data-paginated="1" data-table-id="${esc(tableId)}"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function statCards(items) {
  return `<div class="stats-grid">${items
    .map(
      (item) =>
        `<article class="stat-card"><p class="stat-label">${esc(item.label)}</p><p class="stat-value">${esc(item.value)}</p></article>`
    )
    .join("")}</div>`;
}
