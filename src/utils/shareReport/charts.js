import { esc } from "./primitives";

function palette(index) {
  const colors = ["#d1603d", "#1f6f78", "#8a5fd1", "#e56b6f", "#2a9d8f", "#f59e0b", "#06b6d4", "#84cc16"];
  return colors[index % colors.length];
}

export function buildLineChartSvg(series, { title = "", width = 920, height = 320 } = {}) {
  if (!Array.isArray(series) || !series.length) return `<p class="muted">No chart data.</p>`;

  const validSeries = series
    .map((s) => ({
      name: String(s?.account || s?.name || "Series"),
      projectionStartAt: String(s?.projectionStartAt || "").trim() || null,
      points: Array.isArray(s?.points)
        ? s.points
            .map((p) => ({
              createdAt: String(p?.createdAt || ""),
              value: Number(p?.value),
            }))
            .filter((p) => p.createdAt && Number.isFinite(p.value))
        : [],
    }))
    .filter((s) => s.points.length >= 2);

  if (!validSeries.length) return `<p class="muted">No chart data.</p>`;

  const labels = Array.from(new Set(validSeries.flatMap((s) => s.points.map((p) => p.createdAt)))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
  if (labels.length < 2) return `<p class="muted">No chart data.</p>`;

  const values = validSeries.flatMap((s) => s.points.map((p) => p.value));
  let minY = Math.min(...values);
  let maxY = Math.max(...values);
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return `<p class="muted">No chart data.</p>`;
  if (maxY <= minY) maxY = minY + 1;

  const pad = { left: 56, right: 18, top: 16, bottom: 28 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);

  const xMap = new Map(labels.map((label, idx) => [label, idx]));
  const x = (idx) => pad.left + (idx / (labels.length - 1)) * plotW;
  const y = (v) => pad.top + (1 - (v - minY) / (maxY - minY)) * plotH;

  const horizontalGuides = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const yy = pad.top + ratio * plotH;
      return `<line x1="${pad.left}" y1="${yy.toFixed(2)}" x2="${(pad.left + plotW).toFixed(2)}" y2="${yy.toFixed(2)}" stroke="#2f3746" stroke-width="1" />`;
    })
    .join("");

  const polylines = validSeries
    .map((s, idx) => {
      const allPoints = s.points
        .map((p) => {
          const i = xMap.get(p.createdAt);
          if (i == null) return null;
          return `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`;
        })
        .filter(Boolean);

      if (!s.projectionStartAt) {
        return `<polyline points="${allPoints.join(" ")}" fill="none" stroke="${palette(idx)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;
      }

      const splitIndex = s.points.findIndex((p) => p.createdAt === s.projectionStartAt);
      if (splitIndex < 0 || splitIndex >= allPoints.length - 1) {
        return `<polyline points="${allPoints.join(" ")}" fill="none" stroke="${palette(idx)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;
      }

      const historical = allPoints.slice(0, splitIndex + 1).join(" ");
      const projected = allPoints.slice(splitIndex).join(" ");
      return `
        <polyline points="${historical}" fill="none" stroke="${palette(idx)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        <polyline points="${projected}" fill="none" stroke="${palette(idx)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="6 4" />
      `;
    })
    .join("");

  const xLabelFirst = labels[0];
  const xLabelLast = labels[labels.length - 1];
  const yLabelMin = Math.round(minY).toLocaleString("en-US");
  const yLabelMax = Math.round(maxY).toLocaleString("en-US");

  const legend = validSeries
    .map((s, idx) => `<span class="legend-item"><i style="background:${palette(idx)}"></i>${esc(s.name)}</span>`)
    .join("");

  return `
    <div class="chart-card">
      <p class="chart-title">${esc(title)}</p>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
        <rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" fill="#141926" rx="8" />
        ${horizontalGuides}
        ${polylines}
        <text x="${pad.left}" y="${(height - 8).toFixed(0)}" fill="#8ca0bc" font-size="11">${esc(xLabelFirst)}</text>
        <text x="${(pad.left + plotW).toFixed(0)}" y="${(height - 8).toFixed(0)}" text-anchor="end" fill="#8ca0bc" font-size="11">${esc(xLabelLast)}</text>
        <text x="${(pad.left - 8).toFixed(0)}" y="${(pad.top + 10).toFixed(0)}" text-anchor="end" fill="#8ca0bc" font-size="11">${esc(yLabelMax)}</text>
        <text x="${(pad.left - 8).toFixed(0)}" y="${(pad.top + plotH).toFixed(0)}" text-anchor="end" fill="#8ca0bc" font-size="11">${esc(yLabelMin)}</text>
      </svg>
      <div class="legend">${legend}</div>
    </div>
  `;
}

export function buildBarChartSvg(rows, { title = "", width = 920, height = 280 } = {}) {
  const cleaned = Array.isArray(rows)
    ? rows
        .map((r) => ({
          label: String(r?.accountName || r?.label || ""),
          value: Number(r?.value),
        }))
        .filter((r) => r.label && Number.isFinite(r.value) && r.value > 0)
    : [];

  if (!cleaned.length) return `<p class="muted">No chart data.</p>`;

  const pad = { left: 220, right: 24, top: 20, bottom: 18 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const rowHeight = 22;
  const gap = 8;
  const dynamicH = Math.max(height, pad.top + pad.bottom + cleaned.length * (rowHeight + gap));

  const max = Math.max(...cleaned.map((r) => r.value), 1);
  const bars = cleaned
    .map((r, idx) => {
      const y = pad.top + idx * (rowHeight + gap);
      const w = (r.value / max) * plotW;
      return `
        <text x="${pad.left - 8}" y="${(y + rowHeight - 6).toFixed(2)}" text-anchor="end" fill="#c9d6e8" font-size="12">${esc(r.label)}</text>
        <rect x="${pad.left}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${rowHeight}" rx="6" fill="#0ea5e9" />
        <text x="${(pad.left + w + 8).toFixed(2)}" y="${(y + rowHeight - 6).toFixed(2)}" fill="#e5eefc" font-size="12">${Math.round(r.value).toLocaleString("en-US")}</text>
      `;
    })
    .join("");

  return `
    <div class="chart-card">
      <p class="chart-title">${esc(title)}</p>
      <svg viewBox="0 0 ${width} ${dynamicH}" role="img" aria-label="${esc(title)}">
        <rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${Math.max(1, dynamicH - pad.top - pad.bottom)}" fill="#141926" rx="8" />
        ${bars}
      </svg>
    </div>
  `;
}
