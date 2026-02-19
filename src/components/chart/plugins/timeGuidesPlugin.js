export const timeGuidesPlugin = {
  id: "timeGuides",
  afterDraw(chart, _args, pluginOptions) {
    if (!pluginOptions?.enabled) return;
    const xScale = chart.scales?.x;
    const area = chart.chartArea;
    if (!xScale || !area) return;

    const ctx = chart.ctx;
    const dayMarkers = Array.isArray(pluginOptions.dayMarkers) ? pluginOptions.dayMarkers : [];
    const segmentMarkers = Array.isArray(pluginOptions.segmentMarkers) ? pluginOptions.segmentMarkers : [];
    const dayLineColor = pluginOptions.dayLineColor || "rgba(255,255,255,0.25)";
    const segmentLineColor = pluginOptions.segmentLineColor || "rgba(255,255,255,0.12)";
    const textColor = pluginOptions.textColor || "rgba(255,255,255,0.75)";

    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = segmentLineColor;
    for (const marker of segmentMarkers) {
      const x = xScale.getPixelForValue(marker.index);
      if (!Number.isFinite(x) || x < area.left || x > area.right) continue;
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = dayLineColor;
    ctx.fillStyle = textColor;
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let lastDayLabelX = -Infinity;
    for (const marker of dayMarkers) {
      const x = xScale.getPixelForValue(marker.index);
      if (!Number.isFinite(x) || x < area.left || x > area.right) continue;
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
      if (x - lastDayLabelX >= 64) {
        ctx.fillText(String(marker.label || ""), x + 4, area.top + 4);
        lastDayLabelX = x;
      }
    }
    ctx.restore();
  },
};
