import { useEffect, useMemo, useRef, useState } from "react";
import { Chart } from "chart.js/auto";
import zoomPlugin from "chartjs-plugin-zoom";
import "hammerjs";
import { formatTimestamp, formatAxisTimestamp, metricLabel, timeBucketFromLocalTime } from "../utils";
import { withAlpha } from "./chart/color";
import { nowMarkerPlugin } from "./chart/plugins/nowMarkerPlugin";
import { timeGuidesPlugin } from "./chart/plugins/timeGuidesPlugin";

Chart.register(zoomPlugin);
Chart.register(nowMarkerPlugin);
Chart.register(timeGuidesPlugin);

export function LineChart({ payload, metric, timeZone, themeDark, baselineMode = "raw" }) {
    const rootRef = useRef(null);
    const canvasRef = useRef(null);
    const chartRef = useRef(null);
    const zoomWindowRef = useRef(null);
    const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
    const [interactionMode, setInteractionMode] = useState("zoom");
    const [wheelZoomEnabled, setWheelZoomEnabled] = useState(true);
    const [rangePreset, setRangePreset] = useState("all");
    const [brushStart, setBrushStart] = useState(0);
    const [brushEnd, setBrushEnd] = useState(1);

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function toLabelIndex(value) {
        const direct = Number(value);
        if (Number.isFinite(direct)) return direct;
        if (typeof value === "string") {
            const idx = labels.indexOf(value);
            if (idx >= 0) return idx;
        }
        return Number.NaN;
    }

    function dayKeyFromIso(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        return new Intl.DateTimeFormat("fr-BE", {
            timeZone,
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
        }).format(d);
    }

    const labels = useMemo(() => {
        if (!payload?.series) return [];
        const set = new Set();
        Object.values(payload.series).forEach((points) => points.forEach((p) => set.add(p.createdAt)));
        return [...set].sort();
    }, [payload]);

    const hasSeriesData = useMemo(() => {
        if (!payload?.series) return false;
        const keys = Object.keys(payload.series);
        if (!keys.length) return false;
        return keys.some((k) => Array.isArray(payload.series[k]) && payload.series[k].length > 0);
    }, [payload]);

    const xAxisNeedsDate = useMemo(() => {
        const daySet = new Set(
            labels.map((iso) => {
                const d = new Date(iso);
                if (Number.isNaN(d.getTime())) return String(iso);
                return new Intl.DateTimeFormat("fr-BE", {
                    timeZone,
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                }).format(d);
            })
        );
        return daySet.size > 1;
    }, [labels, timeZone]);

    const xGuides = useMemo(() => {
        if (labels.length < 2) return { dayMarkers: [], segmentMarkers: [] };
        const dayMarkers = [];
        const segmentMarkers = [];
        let prevDayKey = null;
        let prevSegment = null;
        for (let i = 0; i < labels.length; i += 1) {
            const iso = labels[i];
            const date = new Date(iso);
            if (Number.isNaN(date.getTime())) continue;
            const parts = new Intl.DateTimeFormat("en-US", {
                timeZone,
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            }).formatToParts(date);
            const weekday = String(parts.find((p) => p.type === "weekday")?.value || "");
            const day = String(parts.find((p) => p.type === "day")?.value || "");
            const month = String(parts.find((p) => p.type === "month")?.value || "");
            const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
            const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");
            const dayKey = `${day}/${month}`;
            const segment = timeBucketFromLocalTime(hour, minute);

            if (i === 0 || dayKey !== prevDayKey) {
                dayMarkers.push({ index: i, label: `${weekday} ${day}/${month}` });
            }
            if (i > 0 && segment !== prevSegment) {
                segmentMarkers.push({ index: i, label: segment });
            }
            prevDayKey = dayKey;
            prevSegment = segment;
        }
        return { dayMarkers, segmentMarkers };
    }, [labels, timeZone]);

    const maxIndex = Math.max(0, labels.length - 1);

    useEffect(() => {
        if (hasEnteredViewport) return;
        const node = rootRef.current;
        if (!node || typeof IntersectionObserver !== "function") {
            setHasEnteredViewport(true);
            return;
        }
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setHasEnteredViewport(true);
                    obs.disconnect();
                }
            },
            { root: null, rootMargin: "120px 0px", threshold: 0.01 }
        );
        obs.observe(node);
        return () => obs.disconnect();
    }, [hasEnteredViewport]);

    function applyXRange(minIndex, maxIndexValue, animate = false) {
        const chart = chartRef.current;
        if (!chart) return;
        const xOptions = chart.options?.scales?.x;
        if (!xOptions) return;
        if (labels.length < 2) return;
        const safeMin = clamp(minIndex, 0, maxIndex - 1);
        const safeMax = clamp(maxIndexValue, safeMin + 1, maxIndex);
        xOptions.min = safeMin;
        xOptions.max = safeMax;
        chart.update(animate ? undefined : "none");
        refreshZoomState(chart);
    }

    function refreshZoomState(chart) {
        if (!chart || labels.length < 2) return;
        const xOptions = chart.options?.scales?.x;
        const xScale = chart.scales?.x;
        if (!xScale || !xOptions) return;
        const fullMin = 0;
        const fullMax = labels.length - 1;
        // Category scales can surface min/max as label strings after zoom/pan.
        const scaleMin = toLabelIndex(xScale.min);
        const scaleMax = toLabelIndex(xScale.max);
        const optionMin = xOptions.min == null ? fullMin : toLabelIndex(xOptions.min);
        const optionMax = xOptions.max == null ? fullMax : toLabelIndex(xOptions.max);
        const min = Number.isFinite(scaleMin) ? scaleMin : optionMin;
        const max = Number.isFinite(scaleMax) ? scaleMax : optionMax;
        const zoomed = Number.isFinite(min) && Number.isFinite(max) && (min > fullMin || max < fullMax);
        zoomWindowRef.current = zoomed ? { min, max } : null;
        if (Number.isFinite(min) && Number.isFinite(max)) {
            const boundedStart = clamp(Math.floor(min), fullMin, Math.max(fullMin, fullMax - 1));
            const boundedEnd = clamp(Math.ceil(max), boundedStart + 1, fullMax);
            setBrushStart(boundedStart);
            setBrushEnd(boundedEnd);
        }
    }

    function applyRangePreset(nextPreset) {
        setRangePreset(nextPreset);
        const chart = chartRef.current;
        if (!chart || labels.length < 2) return;
        if (nextPreset === "custom") return;

        const xOptions = chart.options?.scales?.x;
        if (!xOptions) return;

        const maxIndex = labels.length - 1;
        if (nextPreset === "all") {
            if (typeof chart.resetZoom === "function") chart.resetZoom();
            xOptions.min = undefined;
            xOptions.max = undefined;
            chart.update("none");
            setBrushStart(0);
            setBrushEnd(maxIndex);
            refreshZoomState(chart);
            return;
        }

        const size = nextPreset === "last24" ? 24 : 72;
        const minIndex = Math.max(0, maxIndex - size + 1);
        setBrushStart(minIndex);
        setBrushEnd(maxIndex);
        applyXRange(minIndex, maxIndex);
    }

    function resetZoom() {
        const chart = chartRef.current;
        if (!chart) return;
        if (typeof chart.resetZoom === "function") chart.resetZoom();
        const xOptions = chart.options?.scales?.x;
        if (xOptions) {
            xOptions.min = undefined;
            xOptions.max = undefined;
        }
        setRangePreset("all");
        setBrushStart(0);
        setBrushEnd(maxIndex);
        zoomWindowRef.current = null;
        chart.update("none");
        refreshZoomState(chart);
    }

    function exportPng() {
        const chart = chartRef.current;
        if (!chart || !canvasRef.current) return;
        const url = chart.toBase64Image("image/png", 1);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vox-chart-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    useEffect(() => {
        setRangePreset("all");
        setBrushStart(0);
        setBrushEnd(Math.max(0, labels.length - 1));
    }, [labels.length]);

    useEffect(() => {
        if (!hasEnteredViewport) return;
        if (!canvasRef.current) return;
        if (!payload?.series) {
            if (chartRef.current) chartRef.current.destroy();
            chartRef.current = null;
            return;
        }

        const palette = ["#d1603d", "#1f6f78", "#bc5c2d", "#3f8f6f", "#8a5fd1", "#aa7a17", "#e56b6f", "#355070", "#2a9d8f", "#b56576"];
        const css = getComputedStyle(document.body);
        const textColor = (css.getPropertyValue("--foreground") || "#eaeaea").trim();
        const lineColor = (css.getPropertyValue("--border") || "#444").trim();
        const zoomAccent = (css.getPropertyValue("--ring") || "#4aa3df").trim();
        const accountEntries = Object.entries(payload.series)
            .map(([account, points]) => {
                const ordered = [...points].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
                const projectionStartIso = payload?.projectionStartByAccount?.[account];
                const projectionStartMs = projectionStartIso ? Date.parse(projectionStartIso) : NaN;
                let currentPoint = ordered[ordered.length - 1];
                if (Number.isFinite(projectionStartMs)) {
                    for (let i = ordered.length - 1; i >= 0; i -= 1) {
                        if (Date.parse(ordered[i].createdAt) <= projectionStartMs) {
                            currentPoint = ordered[i];
                            break;
                        }
                    }
                }
                const currentValue = Number(currentPoint?.[metric]);
                return {
                    account,
                    points: ordered,
                    currentValue: Number.isFinite(currentValue) ? currentValue : -Infinity,
                };
            })
            .sort((a, b) => {
                if (a.currentValue !== b.currentValue) return b.currentValue - a.currentValue;
                return String(a.account || "").localeCompare(String(b.account || ""));
            });

        const datasets = accountEntries.flatMap(({ account, points }, index) => {
            const ordered = [...points].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
            const projectionStartIso = payload?.projectionStartByAccount?.[account];
            const projectionStartMs = projectionStartIso ? Date.parse(projectionStartIso) : NaN;
            let baseline = null;
            if (baselineMode !== "raw") {
                const first = ordered.find((p) => Number.isFinite(Number(p[metric])));
                baseline = first ? Number(first[metric]) : null;
            }
            const map = new Map(
                ordered.map((p) => {
                    const value = Number(p[metric]);
                    if (!Number.isFinite(value)) return [p.createdAt, null];
                    if (baselineMode === "delta") return [p.createdAt, baseline == null ? null : value - baseline];
                    if (baselineMode === "index100") {
                        if (baseline == null || baseline === 0) return [p.createdAt, null];
                        return [p.createdAt, (value / baseline) * 100];
                    }
                    return [p.createdAt, value];
                })
            );
            const baseDataset = {
                label: account,
                data: labels.map((x) => (map.has(x) ? map.get(x) : null)),
                borderColor: palette[index % palette.length],
                backgroundColor: palette[index % palette.length],
                borderWidth: 2,
                pointRadius: 1.8,
                pointHoverRadius: 4,
                tension: 0.35,
                cubicInterpolationMode: "monotone",
                fill: false,
                spanGaps: true,
            };

            if (!Number.isFinite(projectionStartMs)) return [baseDataset];

            const historicalData = labels.map((x) => {
                const ms = Date.parse(x);
                if (!Number.isFinite(ms) || ms > projectionStartMs) return null;
                return map.has(x) ? map.get(x) : null;
            });
            const projectedData = labels.map((x) => {
                const ms = Date.parse(x);
                if (!Number.isFinite(ms) || ms < projectionStartMs) return null;
                return map.has(x) ? map.get(x) : null;
            });

            return [
                {
                    ...baseDataset,
                    data: historicalData,
                },
                {
                    ...baseDataset,
                    label: `${account} (Projected)`,
                    data: projectedData,
                    isProjected: true,
                    borderColor: withAlpha(palette[index % palette.length], 0.5),
                    backgroundColor: withAlpha(palette[index % palette.length], 0.5),
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    borderDash: [8, 6],
                },
            ];
        });

        const allValues = [];
        datasets.forEach((ds) => ds.data.forEach((p) => allValues.push(Number(p))));
        const finiteValues = allValues.filter((v) => Number.isFinite(v));
        let yMin;
        let yMax;
        if (finiteValues.length) {
            const min = Math.min(...finiteValues);
            const max = Math.max(...finiteValues);
            const delta = Math.max(1, max - min);
            yMin = Math.max(0, Math.floor(min - delta * 0.08));
            yMax = Math.ceil(max + delta * 0.08);
        }

        const projectionStartCandidates = Object.values(payload?.projectionStartByAccount || {})
            .map((iso) => Date.parse(iso))
            .filter((ms) => Number.isFinite(ms));
        let nowMarkerIndex = null;
        if (projectionStartCandidates.length && labels.length) {
            const nowMs = Math.max(...projectionStartCandidates);
            let idx = labels.findIndex((iso) => {
                const ms = Date.parse(iso);
                return Number.isFinite(ms) && ms >= nowMs;
            });
            if (idx < 0) idx = labels.length - 1;
            nowMarkerIndex = idx;
        }

        if (chartRef.current) chartRef.current.destroy();
        chartRef.current = new Chart(canvasRef.current, {
            type: "line",
            data: { labels, datasets },
            options: {
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            color: textColor,
                            filter: (legendItem, data) => {
                                const ds = data?.datasets?.[legendItem.datasetIndex];
                                return !ds?.isProjected;
                            },
                        },
                    },
                    tooltip: {
                        callbacks: {
                            title(items) {
                                if (!items.length) return "";
                                return formatTimestamp(items[0].label, timeZone);
                            },
                        },
                    },
                    nowMarker: {
                        enabled: Number.isFinite(nowMarkerIndex),
                        index: nowMarkerIndex,
                        label: "Now",
                        color: withAlpha(textColor, 0.7),
                    },
                    timeGuides: {
                        enabled: true,
                        dayMarkers: xGuides.dayMarkers,
                        segmentMarkers: [],
                        dayLineColor: withAlpha(textColor, 0.22),
                        segmentLineColor: withAlpha(textColor, 0.11),
                        textColor: withAlpha(textColor, 0.72),
                    },
                    zoom: {
                        limits: {
                            x: { min: 0, max: Math.max(1, labels.length - 1), minRange: 2 },
                        },
                        pan: {
                            enabled: interactionMode === "pan",
                            mode: "x",
                        },
                        zoom: {
                            mode: "x",
                            wheel: { enabled: wheelZoomEnabled },
                            pinch: { enabled: true },
                            drag: {
                                enabled: interactionMode === "zoom",
                                borderColor: zoomAccent,
                                borderWidth: 1,
                                backgroundColor: `${zoomAccent}33`,
                            },
                        },
                        onZoomComplete: ({ chart }) => refreshZoomState(chart),
                        onPanComplete: ({ chart }) => refreshZoomState(chart),
                    },
                },
                scales: {
                    x: {
                        grid: { color: lineColor },
                        ticks: {
                            color: textColor,
                            autoSkip: true,
                            maxRotation: 0,
                            callback(value) {
                                const idx = Number(value);
                                const iso = this.getLabelForValue(value);
                                if (!xAxisNeedsDate) return formatAxisTimestamp(iso, timeZone, false);
                                if (!Number.isFinite(idx) || idx < 0 || idx >= labels.length) {
                                    return formatAxisTimestamp(iso, timeZone, false);
                                }
                                const prevIso = idx > 0 ? labels[idx - 1] : null;
                                const dayChanged = !prevIso || dayKeyFromIso(prevIso) !== dayKeyFromIso(iso);
                                if (dayChanged) return formatTimestamp(iso, timeZone, true);
                                // Keep hours readable without clutter: show time only on every 4th tick.
                                if (idx % 4 !== 0) return "";
                                return formatAxisTimestamp(iso, timeZone, false);
                            },
                        },
                    },
                    y: {
                        grid: { color: lineColor },
                        beginAtZero: false,
                        min: yMin,
                        max: yMax,
                        ticks: { color: textColor },
                        title: {
                            display: true,
                            text:
                                baselineMode === "index100"
                                    ? `${metricLabel(metric)} (Index=100)`
                                    : baselineMode === "delta"
                                        ? `${metricLabel(metric)} (Delta from Start)`
                                        : metricLabel(metric),
                            color: textColor,
                        },
                    },
                },
            },
        });

        if (zoomWindowRef.current && labels.length >= 2) {
            const fullMax = labels.length - 1;
            const min = clamp(Math.floor(zoomWindowRef.current.min), 0, Math.max(0, fullMax - 1));
            const max = clamp(Math.ceil(zoomWindowRef.current.max), min + 1, fullMax);
            const xOptions = chartRef.current.options?.scales?.x;
            if (xOptions) {
                xOptions.min = min;
                xOptions.max = max;
            }
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!chartRef.current) return;
                chartRef.current.resize();
                chartRef.current.update("none");
            });
        });
        refreshZoomState(chartRef.current);

        return () => {
            if (chartRef.current) chartRef.current.destroy();
        };
    }, [
        hasEnteredViewport,
        interactionMode,
        labels,
        metric,
        payload,
        baselineMode,
        themeDark,
        timeZone,
        wheelZoomEnabled,
        xAxisNeedsDate,
        xGuides,
    ]);

    if (!hasSeriesData) {
        return (
            <div ref={rootRef} className="chart-empty-state">
                <p>Select one or more accounts to display chart data.</p>
            </div>
        );
    }

    return (
        <div ref={rootRef}>
            {!hasEnteredViewport ? (
                <div className="chart-empty-state">
                    <p>Loading chart...</p>
                </div>
            ) : null}
            <div className={hasEnteredViewport ? "chart-mounted" : "chart-hidden"}>
                <div className="chart-controls">
                    <div className="toolbar compact">
                        <button
                            type="button"
                            className={`btn ghost ${interactionMode === "zoom" ? "is-active" : ""}`}
                            onClick={() => setInteractionMode("zoom")}
                        >
                            Select Zoom
                        </button>
                        <button
                            type="button"
                            className={`btn ghost ${interactionMode === "pan" ? "is-active" : ""}`}
                            onClick={() => setInteractionMode("pan")}
                        >
                            Pan
                        </button>
                        <button
                            type="button"
                            className={`btn ghost ${wheelZoomEnabled ? "is-active" : ""}`}
                            onClick={() => setWheelZoomEnabled((v) => !v)}
                        >
                            Wheel Zoom
                        </button>
                        <select value={rangePreset} onChange={(e) => applyRangePreset(e.target.value)}>
                            <option value="all">All Points</option>
                            <option value="last24">Last 24</option>
                            <option value="last72">Last 72</option>
                            <option value="custom">Custom</option>
                        </select>
                        <button type="button" className="btn ghost" onClick={resetZoom} disabled={labels.length < 2}>
                            Reset Zoom
                        </button>
                        <button type="button" className="btn ghost" onClick={exportPng}>
                            PNG
                        </button>
                    </div>
                    <p className="muted">
                        {interactionMode === "zoom"
                            ? "Drag on chart to zoom X axis. Use mouse wheel if enabled."
                            : "Drag on chart to pan horizontally."}
                    </p>
                </div>
                <div className="brush-wrap">
                    <div className="brush-readout">
                        <span>{formatTimestamp(labels[brushStart], timeZone)}</span>
                        <span>{formatTimestamp(labels[brushEnd], timeZone)}</span>
                    </div>
                    <div className="brush-sliders">
                        <input
                            type="range"
                            min={0}
                            max={maxIndex}
                            value={Math.min(brushStart, Math.max(0, brushEnd - 1))}
                            disabled={labels.length < 2}
                            onChange={(e) => {
                                const next = Number(e.target.value);
                                const constrained = Math.min(next, Math.max(0, brushEnd - 1));
                                setBrushStart(constrained);
                                setRangePreset("custom");
                                applyXRange(constrained, brushEnd);
                            }}
                        />
                        <input
                            type="range"
                            min={0}
                            max={maxIndex}
                            value={Math.max(brushEnd, Math.min(maxIndex, brushStart + 1))}
                            disabled={labels.length < 2}
                            onChange={(e) => {
                                const next = Number(e.target.value);
                                const constrained = Math.max(next, Math.min(maxIndex, brushStart + 1));
                                setBrushEnd(constrained);
                                setRangePreset("custom");
                                applyXRange(brushStart, constrained);
                            }}
                        />
                    </div>
                </div>
                <div className="chart-canvas-box">
                    <canvas ref={canvasRef} onDoubleClick={resetZoom} />
                </div>
            </div>
        </div>
    );
}
