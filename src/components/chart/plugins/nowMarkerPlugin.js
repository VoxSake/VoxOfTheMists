export const nowMarkerPlugin = {
  id: "nowMarker",
  afterDraw(chart, _args, pluginOptions) {
    if (!pluginOptions?.enabled) return;
    const xScale = chart.scales?.x;
    const yScale = chart.scales?.y;
    const idx = Number(pluginOptions.index);
    if (!xScale || !yScale || !Number.isFinite(idx)) return;

    const x = xScale.getPixelForValue(idx);
    if (!Number.isFinite(x)) return;

    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = pluginOptions.color || "rgba(255,255,255,0.45)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yScale.top);
    ctx.lineTo(x, yScale.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = pluginOptions.color || "rgba(255,255,255,0.75)";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(pluginOptions.label || "Now"), x + 6, yScale.top + 4);
    ctx.restore();
  },
};
