import { useEffect, useMemo, useRef, useState } from "react";
import { Chart } from "chart.js/auto";
import zoomPlugin from "chartjs-plugin-zoom";
import "hammerjs";

Chart.register(zoomPlugin);

const METRIC_OPTIONS = [
  { value: "weeklyKills", label: "Weekly" },
  { value: "totalKills", label: "Total" },
];

const TOP_OPTIONS = [10, 15, 20];
const SCOPE_OPTIONS = [
  { value: "week", label: "Current Week (Fast)" },
  { value: "all", label: "All Time" },
];

function fmtNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(Number(value || 0));
}

function metricLabel(metric) {
  return metric === "totalKills" ? "Total Kills" : "Weekly Kills";
}

function isAnonymizedAccount(name) {
  const v = String(name || "").trim();
  if (!v) return false;
  if (/(anon|anonym|hidden|private)/i.test(v)) return true;
  // GW2Mists sometimes returns obfuscated handles like "aDena.7465".
  return /^[a-z][A-Z][A-Za-z0-9]{2,}\.\d{4}$/.test(v);
}

function useTimeZone() {
  const allZones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
  const saved = localStorage.getItem("vox-timezone");
  const initial = saved && allZones.includes(saved) ? saved : allZones.includes("Europe/Brussels") ? "Europe/Brussels" : allZones[0];
  const [timeZone, setTimeZone] = useState(initial);

  useEffect(() => {
    localStorage.setItem("vox-timezone", timeZone);
  }, [timeZone]);

  return { allZones, timeZone, setTimeZone };
}

function formatTimestamp(iso, timeZone, dateOnly = false) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-BE", {
    timeZone,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: dateOnly ? undefined : "2-digit",
    minute: dateOnly ? undefined : "2-digit",
  }).format(date);
}

function formatAxisTimestamp(iso, timeZone, includeDate = false) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return new Intl.DateTimeFormat("fr-BE", {
    timeZone,
    day: includeDate ? "2-digit" : undefined,
    month: includeDate ? "2-digit" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function timeBucketFromHour(hour) {
  // Snapshots are hourly at :00, so boundary hours are attributed to the previous period.
  if (hour === 0 || hour === 23) return "Evening";
  if (hour >= 1 && hour <= 6) return "Night";
  if (hour >= 7 && hour <= 12) return "Morning";
  if (hour >= 13 && hour <= 20) return "Afternoon";
  return "Primetime"; // 21-22
}

function localHour(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value || "0");
  return Number.isFinite(h) ? h : 0;
}

function localWeekday(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Monday";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(date);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map((h) => esc(h.label)).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h.key])).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function LineChart({ payload, metric, timeZone, themeDark, baselineMode = "raw" }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
  const [interactionMode, setInteractionMode] = useState("zoom");
  const [wheelZoomEnabled, setWheelZoomEnabled] = useState(true);
  const [rangePreset, setRangePreset] = useState("all");
  const [canResetZoom, setCanResetZoom] = useState(false);
  const [brushStart, setBrushStart] = useState(0);
  const [brushEnd, setBrushEnd] = useState(1);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
    if (!chart || labels.length < 2) {
      setCanResetZoom(false);
      return;
    }
    const xScale = chart.scales?.x;
    if (!xScale) {
      setCanResetZoom(false);
      return;
    }
    const fullMin = 0;
    const fullMax = labels.length - 1;
    const min = Number(xScale.min);
    const max = Number(xScale.max);
    const zoomed = Number.isFinite(min) && Number.isFinite(max) && (min > fullMin || max < fullMax);
    setCanResetZoom(zoomed);
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
    setCanResetZoom(false);
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
    const textColor = (css.getPropertyValue("--text-primary") || "#eaeaea").trim();
    const lineColor = (css.getPropertyValue("--border-default") || "#444").trim();
    const zoomAccent = (css.getPropertyValue("--accent") || "#4aa3df").trim();
    const datasets = Object.entries(payload.series).map(([account, points], index) => {
      const ordered = [...points].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
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
      return {
        label: account,
        data: labels.map((x) => (map.has(x) ? map.get(x) : null)),
        borderColor: palette[index % palette.length],
        backgroundColor: palette[index % palette.length],
        borderWidth: 2,
        pointRadius: 1.8,
        pointHoverRadius: 4,
        tension: 0.2,
        fill: false,
        spanGaps: true,
      };
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

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: { labels, datasets },
      options: {
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { position: "bottom", labels: { color: textColor } },
          tooltip: {
            callbacks: {
              title(items) {
                if (!items.length) return "";
                return formatTimestamp(items[0].label, timeZone);
              },
            },
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
                return formatAxisTimestamp(this.getLabelForValue(value), timeZone, xAxisNeedsDate);
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
    // Force a post-mount resize to avoid first-visibility compositor glitches.
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
      <div style={{ display: hasEnteredViewport ? "block" : "none" }}>
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
          <button type="button" className="btn ghost" onClick={resetZoom} disabled={!canResetZoom}>
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

export default function App() {
  const { allZones, timeZone, setTimeZone } = useTimeZone();
  const [metric, setMetric] = useState("weeklyKills");
  const [compareBaseline, setCompareBaseline] = useState("raw");
  const [deltaMetric, setDeltaMetric] = useState("weeklyKills");
  const [topDelta, setTopDelta] = useState(30);
  const [anomalyMinDelta, setAnomalyMinDelta] = useState(80);
  const [topLeaderboard, setTopLeaderboard] = useState(100);
  const [topProgression, setTopProgression] = useState(10);
  const [scope, setScope] = useState("week");
  const [allTimeRange, setAllTimeRange] = useState("30d");
  const [latestSnapshot, setLatestSnapshot] = useState(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState("");
  const [progressionPayload, setProgressionPayload] = useState(null);
  const [compareAccounts, setCompareAccounts] = useState([]);
  const [comparePayload, setComparePayload] = useState(null);
  const [deltaPayload, setDeltaPayload] = useState(null);
  const [anomaliesPayload, setAnomaliesPayload] = useState(null);
  const [healthPayload, setHealthPayload] = useState(null);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [compareInput, setCompareInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [themeDark, setThemeDark] = useState(localStorage.getItem("vox-theme") === "dark");
  const [plainMode, setPlainMode] = useState(localStorage.getItem("vox-plain-mode") === "1");
  const [hideAnonymized, setHideAnonymized] = useState(
    localStorage.getItem("vox-hide-anonymized") === "1"
  );
  const [snapshotRunning, setSnapshotRunning] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());
  const suggestTimer = useRef(null);
  const lastFinishedAtRef = useRef(null);
  const statusPollTimerRef = useRef(null);
  const latestSnapshotIdRef = useRef(null);
  latestSnapshotIdRef.current = latestSnapshot?.snapshotId || null;

  useEffect(() => {
    document.body.classList.toggle("dark", themeDark);
    localStorage.setItem("vox-theme", themeDark ? "dark" : "light");
  }, [themeDark]);

  useEffect(() => {
    document.body.classList.toggle("plain-mode", plainMode);
    localStorage.setItem("vox-plain-mode", plainMode ? "1" : "0");
  }, [plainMode]);

  useEffect(() => {
    localStorage.setItem("vox-hide-anonymized", hideAnonymized ? "1" : "0");
  }, [hideAnonymized]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const allTimeDaysParam =
    scope === "all" ? (allTimeRange === "full" ? null : allTimeRange === "90d" ? 90 : 30) : null;
  const effectiveCompareAccounts = useMemo(
    () => (hideAnonymized ? compareAccounts.filter((a) => !isAnonymizedAccount(a)) : compareAccounts),
    [compareAccounts, hideAnonymized]
  );
  const compareAccountsRef = useRef(effectiveCompareAccounts);
  const scopeRef = useRef(scope);
  const allTimeDaysParamRef = useRef(allTimeDaysParam);
  compareAccountsRef.current = effectiveCompareAccounts;
  scopeRef.current = scope;
  allTimeDaysParamRef.current = allTimeDaysParam;

  async function loadOverview() {
    const [latest, snapshots] = await Promise.all([
      fetchJson(`/api/latest?top=${topLeaderboard}`),
      fetchJson("/api/snapshots"),
    ]);
    setLatestSnapshot(latest.snapshot);
    setEntries(latest.entries || []);
    setSnapshotCount((snapshots.snapshots || []).length);
  }

  async function loadProgression() {
    const daysQuery = allTimeDaysParam ? `&days=${allTimeDaysParam}` : "";
    const payload = await fetchJson(
      `/api/progression/top?top=${topProgression}&scope=${encodeURIComponent(scope)}${daysQuery}`
    );
    setProgressionPayload(payload);
  }

  async function loadCompare(accounts = compareAccountsRef.current) {
    if (!accounts.length) {
      setComparePayload(null);
      return;
    }
    const scopeValue = scopeRef.current;
    const daysValue = allTimeDaysParamRef.current;
    const daysQuery = daysValue ? `&days=${daysValue}` : "";
    const payload = await fetchJson(
      `/api/compare?accounts=${encodeURIComponent(accounts.join(","))}&scope=${encodeURIComponent(scopeValue)}${daysQuery}`
    );
    setComparePayload(payload);
  }

  async function loadDelta() {
    const payload = await fetchJson(
      `/api/leaderboard/delta?top=${topDelta}&metric=${encodeURIComponent(deltaMetric)}&scope=${encodeURIComponent(scope)}`
    );
    setDeltaPayload(payload);
  }

  async function loadAnomalies() {
    const payload = await fetchJson(
      `/api/anomalies?top=20&minDeltaAbs=${anomalyMinDelta}&lookbackHours=72&scope=${encodeURIComponent(scope)}`
    );
    setAnomaliesPayload(payload);
  }

  async function loadHealth() {
    const payload = await fetchJson("/api/health");
    setHealthPayload(payload);
  }

  async function loadWeeklyReport() {
    const payload = await fetchJson("/api/report/weekly");
    setWeeklyReport(payload);
  }

  async function runManualSnapshot() {
    if (snapshotRunning) return;
    setSnapshotRunning(true);
    setSnapshotMessage("Running snapshot...");
    try {
      const res = await fetch("/api/snapshot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      await Promise.all([loadOverview(), loadProgression(), loadCompare()]);
      await Promise.all([loadDelta(), loadAnomalies(), loadHealth(), loadWeeklyReport()]);
      setSnapshotMessage("Snapshot completed and data refreshed.");
    } catch (error) {
      setSnapshotMessage(`Snapshot failed: ${error.message}`);
    } finally {
      setSnapshotRunning(false);
    }
  }

  async function fetchSnapshotStatus() {
    try {
      const status = await fetchJson("/api/snapshot/status");
      setSnapshotRunning(Boolean(status.running));
      let refreshed = false;
      const previousFinishedAt = lastFinishedAtRef.current;
      const currentFinishedAt = status.lastFinishedAt || null;
      const firstSeenFinished = !previousFinishedAt && Boolean(currentFinishedAt);
      const hasNewFinished =
        Boolean(currentFinishedAt) &&
        Boolean(previousFinishedAt) &&
        currentFinishedAt !== previousFinishedAt;

      lastFinishedAtRef.current = currentFinishedAt;

      if ((firstSeenFinished || hasNewFinished) && Number(status.lastExitCode) === 0) {
        await Promise.all([
          loadOverview(),
          loadProgression(),
          loadCompare(),
          loadDelta(),
          loadAnomalies(),
          loadHealth(),
          loadWeeklyReport(),
        ]);
        refreshed = true;
        if (status.lastTrigger === "hourly") {
          setSnapshotMessage("Auto snapshot done: data refreshed.");
        }
      }

      // In Appwrite mode, local snapshot status may not change; detect new latest snapshot via health.
      const health = await fetchJson("/api/health");
      setHealthPayload(health);
      const serverLatestSnapshotId = health?.latestSnapshot?.snapshotId || null;
      const hasNewLatestSnapshot =
        Boolean(serverLatestSnapshotId) && serverLatestSnapshotId !== latestSnapshotIdRef.current;
      if (!refreshed && hasNewLatestSnapshot) {
        await Promise.all([
          loadOverview(),
          loadProgression(),
          loadCompare(),
          loadDelta(),
          loadAnomalies(),
          loadHealth(),
          loadWeeklyReport(),
        ]);
        if (health?.appwriteSyncEnabled) {
          setSnapshotMessage("Appwrite snapshot synced: data refreshed.");
        }
      }
    } catch {
      // Ignore transient polling errors.
    }
  }

  useEffect(() => {
    loadOverview().catch(console.error);
  }, [topLeaderboard]);

  useEffect(() => {
    loadProgression().catch(console.error);
  }, [topProgression, scope, allTimeRange]);

  useEffect(() => {
    loadCompare().catch(console.error);
  }, [compareAccounts, scope, allTimeRange, hideAnonymized]);

  useEffect(() => {
    loadDelta().catch(console.error);
  }, [topDelta, deltaMetric, scope]);

  useEffect(() => {
    loadAnomalies().catch(console.error);
  }, [anomalyMinDelta, scope]);

  useEffect(() => {
    loadHealth().catch(console.error);
    loadWeeklyReport().catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const nextDelayMs = () => {
      const baseMs = 45_000;
      const jitterMs = Math.floor(Math.random() * 30_000); // 0-30s
      return baseMs + jitterMs;
    };

    const schedule = (delay) => {
      clearTimeout(statusPollTimerRef.current);
      statusPollTimerRef.current = setTimeout(async () => {
        if (cancelled) return;
        try {
          await fetchSnapshotStatus();
        } catch {
          // Ignore transient polling errors.
        } finally {
          if (!cancelled) schedule(nextDelayMs());
        }
      }, delay);
    };

    const initialJitter = Math.floor(Math.random() * 12_000); // 0-12s
    schedule(initialJitter);

    return () => {
      cancelled = true;
      clearTimeout(statusPollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/accounts?query=${encodeURIComponent(compareInput)}&limit=12`, {
          signal: ac.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const base = data.accounts || [];
        setSuggestions(hideAnonymized ? base.filter((s) => !isAnonymizedAccount(s)) : base);
      } catch {
        // Ignore aborted/transient autocomplete failures.
      }
    }, 120);
    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(suggestTimer.current);
    };
  }, [compareInput, hideAnonymized]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = hideAnonymized ? entries.filter((e) => !isAnonymizedAccount(e.accountName)) : entries;
    if (!q) return base;
    return base.filter((e) => e.accountName.toLowerCase().includes(q));
  }, [entries, search, hideAnonymized]);

  const filteredProgressionPayload = useMemo(() => {
    if (!hideAnonymized || !progressionPayload?.series) return progressionPayload;
    const series = Object.fromEntries(
      Object.entries(progressionPayload.series).filter(([name]) => !isAnonymizedAccount(name))
    );
    return { ...progressionPayload, series };
  }, [progressionPayload, hideAnonymized]);

  const filteredComparePayload = useMemo(() => {
    if (!hideAnonymized || !comparePayload?.series) return comparePayload;
    const series = Object.fromEntries(
      Object.entries(comparePayload.series).filter(([name]) => !isAnonymizedAccount(name))
    );
    const accounts = (comparePayload.accounts || []).filter((a) => !isAnonymizedAccount(a));
    return { ...comparePayload, accounts, series };
  }, [comparePayload, hideAnonymized]);

  const filteredDeltaRows = useMemo(() => {
    const rows = deltaPayload?.rows || [];
    return hideAnonymized ? rows.filter((r) => !isAnonymizedAccount(r.accountName)) : rows;
  }, [deltaPayload, hideAnonymized]);

  const filteredAnomalies = useMemo(() => {
    const rows = anomaliesPayload?.anomalies || [];
    return hideAnonymized ? rows.filter((r) => !isAnonymizedAccount(r.accountName)) : rows;
  }, [anomaliesPayload, hideAnonymized]);

  const compareSummaries = useMemo(() => {
    if (!filteredComparePayload?.series) return [];
    const accounts = Object.keys(filteredComparePayload.series);
    const dayOrder = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
    return accounts.map((account) => {
      const points = [...(filteredComparePayload.series[account] || [])].sort((a, b) =>
        String(a.createdAt).localeCompare(String(b.createdAt))
      );
      if (points.length < 2) {
        const emptyHoursByDay = Object.fromEntries(dayOrder.map((d) => [d, 0]));
        return {
          account,
          dominant: "Not enough data",
          confidence: 0,
          deltas: { Night: 0, Morning: 0, Afternoon: 0, Primetime: 0, Evening: 0 },
          hoursByDay: emptyHoursByDay,
        };
      }

      const deltas = { Night: 0, Morning: 0, Afternoon: 0, Primetime: 0, Evening: 0 };
      const hoursByDay = Object.fromEntries(dayOrder.map((d) => [d, 0]));
      for (let i = 1; i < points.length; i += 1) {
        const prev = Number(points[i - 1].weeklyKills || 0);
        const cur = Number(points[i].weeklyKills || 0);
        const delta = Math.max(0, cur - prev);
        if (delta <= 0) continue;
        const hour = localHour(points[i].createdAt, timeZone);
        const bucket = timeBucketFromHour(hour);
        deltas[bucket] += delta;
        const weekday = localWeekday(points[i].createdAt, timeZone);
        if (Object.hasOwn(hoursByDay, weekday)) hoursByDay[weekday] += 1;
      }

      const total = Object.values(deltas).reduce((a, b) => a + b, 0);
      const sorted = Object.entries(deltas).sort((a, b) => b[1] - a[1]);
      const [dominant, dominantValue] = sorted[0];
      const confidence = total > 0 ? Math.round((dominantValue / total) * 100) : 0;
      return { account, dominant: total > 0 ? dominant : "No increase detected", confidence, deltas, hoursByDay };
    });
  }, [filteredComparePayload, timeZone]);

  const movers = useMemo(() => {
    const rows = filteredDeltaRows;
    if (!rows.length) return { climbers: [], decliners: [] };
    const byRankGain = [...rows]
      .filter((r) => Number.isFinite(Number(r.rankChange)))
      .sort((a, b) => Number(b.rankChange) - Number(a.rankChange));
    const byRankLoss = [...rows]
      .filter((r) => Number.isFinite(Number(r.rankChange)))
      .sort((a, b) => Number(a.rankChange) - Number(b.rankChange));
    return {
      climbers: byRankGain.slice(0, 3),
      decliners: byRankLoss.slice(0, 3),
    };
  }, [filteredDeltaRows]);

  const weekReset = useMemo(() => {
    const endIso = weeklyReport?.delta?.weekWindow?.endUtc || null;
    if (!endIso) return { endIso: null, countdown: "-" };
    const endMs = Date.parse(endIso);
    if (!Number.isFinite(endMs)) return { endIso, countdown: "-" };
    const diffSec = Math.max(0, Math.floor((endMs - nowMs) / 1000));
    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const seconds = diffSec % 60;
    const countdown =
      diffSec === 0
        ? "Reset window reached"
        : `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(
            seconds
          ).padStart(2, "0")}s`;
    return { endIso, countdown };
  }, [weeklyReport, nowMs]);

  const weeklyTopClimber = useMemo(() => {
    const rows = weeklyReport?.delta?.rows || [];
    if (!rows.length) return null;
    return hideAnonymized ? rows.find((r) => !isAnonymizedAccount(r.accountName)) || null : rows[0];
  }, [weeklyReport, hideAnonymized]);

  const weeklyTopAnomaly = useMemo(() => {
    const rows = weeklyReport?.anomalies?.anomalies || [];
    if (!rows.length) return null;
    return hideAnonymized ? rows.find((r) => !isAnonymizedAccount(r.accountName)) || null : rows[0];
  }, [weeklyReport, hideAnonymized]);
  const canRunManualSnapshot = !healthPayload?.appwriteSyncEnabled;
  const nextSnapshotIso = healthPayload?.appwriteSyncEnabled
    ? healthPayload?.appwriteNextSyncAt || null
    : healthPayload?.nextHourlyAt || null;

  function exportLeaderboardCsv() {
    const headers = [
      { key: "rank", label: "Rank" },
      { key: "accountName", label: "Account" },
      { key: "weeklyKills", label: "WeeklyKills" },
      { key: "totalKills", label: "TotalKills" },
    ];
    downloadCsv(`vox-leaderboard-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`, headers, filteredEntries);
  }

  function exportDeltaCsv() {
    const headers = [
      { key: "latestRank", label: "LatestRank" },
      { key: "previousRank", label: "PreviousRank" },
      { key: "rankChange", label: "RankChange" },
      { key: "accountName", label: "Account" },
      { key: "weeklyKillsDelta", label: "WeeklyDelta" },
      { key: "totalKillsDelta", label: "TotalDelta" },
    ];
    downloadCsv(
      `vox-delta-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      headers,
      filteredDeltaRows
    );
  }

  function exportAnomaliesCsv() {
    const headers = [
      { key: "createdAt", label: "Time" },
      { key: "accountName", label: "Account" },
      { key: "direction", label: "Type" },
      { key: "latestDelta", label: "LatestDelta" },
      { key: "baselineAvg", label: "Baseline" },
      { key: "deviation", label: "Deviation" },
      { key: "deviationPct", label: "DeviationPct" },
    ];
    const rows = filteredAnomalies.map((row) => ({
      createdAt: formatTimestamp(row.createdAt, timeZone),
      accountName: row.accountName,
      direction: row.direction ? row.direction.charAt(0).toUpperCase() + row.direction.slice(1) : "-",
      latestDelta: row.latestDelta,
      baselineAvg: row.baselineAvg,
      deviation: row.deviation,
      deviationPct: row.deviationPct,
    }));
    downloadCsv(
      `vox-anomalies-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      headers,
      rows
    );
  }

  function addCompareAccount(raw) {
    const name = String(raw || "").trim().slice(0, 80);
    if (!name) return;
    if (hideAnonymized && isAnonymizedAccount(name)) return;
    if (compareAccounts.length >= 10) return;
    if (compareAccounts.some((a) => a.toLowerCase() === name.toLowerCase())) return;
    setCompareAccounts((prev) => [...prev, name]);
    setCompareInput("");
  }

  function handleCompareInputChange(value) {
    setCompareInput(value);
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    const matched = suggestions.find((s) => s.toLowerCase() === normalized);
    if (matched) addCompareAccount(matched);
  }

  function removeCompareAccount(account) {
    setCompareAccounts((prev) => prev.filter((a) => a.toLowerCase() !== account.toLowerCase()));
  }

  return (
    <>
      {!plainMode ? <div className="ambient ambient-a" /> : null}
      {!plainMode ? <div className="ambient ambient-b" /> : null}
      {!plainMode ? <div className="ambient ambient-c" /> : null}
      <div className="shell">
        <header className="topbar">
          <div className="title-wrap">
            <p className="eyebrow">Guild Wars 2 - WvW Analytics</p>
            <h1>Vox of the Mists</h1>
          </div>
          <div className="toolbar">
            <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
              {allZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={hideAnonymized}
                onChange={(e) => setHideAnonymized(e.target.checked)}
              />
              Hide anonymized
            </label>
            <button className="btn ghost" onClick={() => setThemeDark((v) => !v)}>
              Theme
            </button>
            <button className={`btn ghost ${plainMode ? "is-active" : ""}`} onClick={() => setPlainMode((v) => !v)}>
              Plain
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <article className="stat-card">
            <p className="stat-label">Latest Snapshot</p>
            <p className="stat-value">{latestSnapshot ? formatTimestamp(latestSnapshot.createdAt, timeZone) : "-"}</p>
            <p className="stat-subtle">
              Next Snapshot{healthPayload?.appwriteSyncEnabled ? " (Appwrite)" : ""}:{" "}
              {formatTimestamp(nextSnapshotIso, timeZone)} ({timeZone})
            </p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Rows in Latest Snapshot</p>
            <p className="stat-value">{latestSnapshot ? fmtNumber(latestSnapshot.count) : "-"}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Total Snapshots</p>
            <p className="stat-value">{fmtNumber(snapshotCount)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Week Reset Countdown</p>
            <p className="stat-value">{weekReset.countdown}</p>
            <p className="stat-subtle">
              Ends: {formatTimestamp(weekReset.endIso, timeZone)} ({timeZone})
            </p>
          </article>
        </section>

        <main className="layout">
          <section className="card">
            <div className="section-head">
              <h2>Leaderboard</h2>
              <div className="toolbar">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search account..." />
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={topLeaderboard}
                  onChange={(e) => setTopLeaderboard(Math.max(1, Math.min(300, Number(e.target.value || 100))))}
                />
                {canRunManualSnapshot ? (
                  <button
                    className="btn"
                    onClick={() => {
                      loadOverview().catch(console.error);
                      loadProgression().catch(console.error);
                      loadCompare().catch(console.error);
                      loadDelta().catch(console.error);
                      loadAnomalies().catch(console.error);
                      loadHealth().catch(console.error);
                      loadWeeklyReport().catch(console.error);
                    }}
                  >
                    Refresh Data
                  </button>
                ) : null}
                {canRunManualSnapshot ? (
                  <button className="btn btn-snapshot" disabled={snapshotRunning} onClick={runManualSnapshot}>
                    {snapshotRunning ? "Snapshot..." : "Run Manual Snapshot"}
                  </button>
                ) : null}
                <button className="btn ghost" onClick={exportLeaderboardCsv}>
                  Export CSV
                </button>
              </div>
            </div>
            <p className="muted">
              {latestSnapshot
                ? `Snapshot: ${latestSnapshot.snapshotId} | Region: ${latestSnapshot.region} | Timezone: ${timeZone}`
                : "No snapshot found. Run the scraper first."}
            </p>
            {snapshotMessage ? <p className="muted">{snapshotMessage}</p> : null}
            {!canRunManualSnapshot ? (
              <p className="muted">Manual snapshots are disabled in Appwrite mode.</p>
            ) : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Account</th>
                    <th>Weekly Kills</th>
                    <th>Total Kills</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((item) => (
                    <tr key={`${item.rank}-${item.accountName}`}>
                      <td>{item.rank}.</td>
                      <td>{item.accountName}</td>
                      <td>{fmtNumber(item.weeklyKills)}</td>
                      <td>{fmtNumber(item.totalKills)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <h2>Rank Movers</h2>
              <div className="toolbar compact">
                <select value={deltaMetric} onChange={(e) => setDeltaMetric(e.target.value)}>
                  <option value="weeklyKills">Sort by Weekly Delta</option>
                  <option value="totalKills">Sort by Total Delta</option>
                </select>
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={topDelta}
                  onChange={(e) => setTopDelta(Math.max(5, Math.min(200, Number(e.target.value || 30))))}
                />
                <button className="btn ghost" onClick={exportDeltaCsv}>
                  Export CSV
                </button>
              </div>
            </div>
            {scope === "week" && deltaPayload?.weekWindow ? (
              <p className="muted">
                Week window: {formatTimestamp(deltaPayload.weekWindow.startUtc, timeZone)} -{" "}
                {formatTimestamp(deltaPayload.weekWindow.endUtc, timeZone)}
              </p>
            ) : null}
            <div className="summary-grid movers-grid">
              <article className="summary-card">
                <p className="summary-account">Biggest Climbers</p>
                {movers.climbers.length ? (
                  <p className="summary-breakdown">
                    {movers.climbers
                      .map((r) => `${r.accountName} (${r.rankChange > 0 ? "+" : ""}${r.rankChange})`)
                      .join(" | ")}
                  </p>
                ) : (
                  <p className="summary-breakdown">No rank movers yet.</p>
                )}
              </article>
              <article className="summary-card">
                <p className="summary-account">Biggest Decliners</p>
                {movers.decliners.length ? (
                  <p className="summary-breakdown">
                    {movers.decliners
                      .map((r) => `${r.accountName} (${r.rankChange > 0 ? "+" : ""}${r.rankChange})`)
                      .join(" | ")}
                  </p>
                ) : (
                  <p className="summary-breakdown">No rank decliners yet.</p>
                )}
              </article>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Prev Rank</th>
                    <th>Rank Change</th>
                    <th>Account</th>
                    <th>Weekly Delta</th>
                    <th>Total Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeltaRows.map((row) => (
                    <tr key={`delta-${row.accountName}`}>
                      <td>{row.latestRank}</td>
                      <td>{row.previousRank ?? "-"}</td>
                      <td>{row.rankChange == null ? "-" : row.rankChange > 0 ? `+${row.rankChange}` : row.rankChange}</td>
                      <td>{row.accountName}</td>
                      <td>{row.weeklyKillsDelta > 0 ? "+" : ""}{fmtNumber(row.weeklyKillsDelta)}</td>
                      <td>{row.totalKillsDelta > 0 ? "+" : ""}{fmtNumber(row.totalKillsDelta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <h2>Anomaly Alerts</h2>
              <div className="toolbar compact">
                <label className="muted" htmlFor="anomalyMin">Min Absolute Deviation</label>
                <input
                  id="anomalyMin"
                  type="number"
                  min={10}
                  max={5000}
                  value={anomalyMinDelta}
                  onChange={(e) => setAnomalyMinDelta(Math.max(10, Math.min(5000, Number(e.target.value || 80))))}
                />
                <button className="btn ghost" onClick={exportAnomaliesCsv}>
                  Export CSV
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th>Latest Delta</th>
                    <th>Baseline</th>
                    <th>Deviation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnomalies.map((row) => (
                    <tr key={`anomaly-${row.accountName}-${row.createdAt}`}>
                      <td>{formatTimestamp(row.createdAt, timeZone)}</td>
                      <td>{row.accountName}</td>
                      <td>{row.direction ? row.direction.charAt(0).toUpperCase() + row.direction.slice(1) : "-"}</td>
                      <td>{row.latestDelta > 0 ? "+" : ""}{fmtNumber(row.latestDelta)}</td>
                      <td>{fmtNumber(row.baselineAvg)}</td>
                      <td>{row.deviation > 0 ? "+" : ""}{fmtNumber(row.deviation)} ({row.deviationPct > 0 ? "+" : ""}{row.deviationPct}%)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
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
                {allTimeRange === "full"
                  ? "From first snapshot"
                  : allTimeRange === "90d"
                    ? "Recent 90 days"
                    : "Recent 30 days"}
              </p>
            ) : null}
            <div className="chart-area chart-area-large">
              <LineChart
                payload={filteredProgressionPayload}
                metric={metric}
                timeZone={timeZone}
                themeDark={themeDark}
              />
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <h2>Compare Accounts</h2>
            </div>
            <div className="toolbar stack compare-controls">
              <div className="tags">
                {effectiveCompareAccounts.map((account) => (
                  <span key={account} className="tag">
                    <span>{account}</span>
                    <button type="button" onClick={() => removeCompareAccount(account)}>
                      x
                    </button>
                  </span>
                ))}
              </div>
              <input
                list="accountSuggestions"
                value={compareInput}
                onChange={(e) => handleCompareInputChange(e.target.value)}
                onBlur={(e) => {
                  const normalized = e.target.value.trim().toLowerCase();
                  if (!normalized) return;
                  const matched = suggestions.find((s) => s.toLowerCase() === normalized);
                  if (matched) addCompareAccount(matched);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addCompareAccount(compareInput);
                  }
                }}
                placeholder="Enter account name, then press Enter"
              />
              <datalist id="accountSuggestions">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <div className="toolbar compact">
                <span className="muted">Chart Baseline</span>
                <select value={compareBaseline} onChange={(e) => setCompareBaseline(e.target.value)}>
                  <option value="raw">Raw</option>
                  <option value="delta">Delta from Start</option>
                  <option value="index100">Indexed (100 at start)</option>
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
            {scope === "week" && comparePayload?.weekWindow ? (
              <p className="muted">
                Week window: {formatTimestamp(comparePayload.weekWindow.startUtc, timeZone)} -{" "}
                {formatTimestamp(comparePayload.weekWindow.endUtc, timeZone)}
              </p>
            ) : null}
            {scope === "all" ? (
              <p className="muted">
                Loaded range:{" "}
                {allTimeRange === "full"
                  ? "From first snapshot"
                  : allTimeRange === "90d"
                    ? "Recent 90 days"
                    : "Recent 30 days"}
              </p>
            ) : null}
            <div className="chart-area">
              <LineChart
                payload={filteredComparePayload}
                metric={metric}
                timeZone={timeZone}
                themeDark={themeDark}
                baselineMode={compareBaseline}
              />
            </div>
            {compareSummaries.length > 0 ? (
              <div className="activity-summary">
                <h3>Activity Summary (Weekly Kill Deltas)</h3>
                <p className="summary-ranges">
                  Time segments (local timezone): Night 00:01-06:00, Morning 06:01-12:00, Afternoon 12:01-20:00, Primetime
                  20:01-22:00, Evening 22:01-00:00
                </p>
                <div className="summary-grid">
                  {compareSummaries.map((s) => (
                    <article key={s.account} className="summary-card">
                      {(() => {
                        const totalHours =
                          s.hoursByDay.Friday +
                          s.hoursByDay.Saturday +
                          s.hoursByDay.Sunday +
                          s.hoursByDay.Monday +
                          s.hoursByDay.Tuesday +
                          s.hoursByDay.Wednesday +
                          s.hoursByDay.Thursday;
                        return (
                          <>
                      <p className="summary-account">{s.account}</p>
                      <p className="summary-main">
                        Dominant time segment: <strong>{s.dominant}</strong>
                        {s.confidence > 0 ? ` (${s.confidence}%)` : ""}
                      </p>
                      <div className="summary-line">
                        <span className="summary-label">Kills by segment</span>
                        <div className="summary-chips">
                          {(() => {
                            const segmentValues = [
                              Number(s.deltas.Night || 0),
                              Number(s.deltas.Morning || 0),
                              Number(s.deltas.Afternoon || 0),
                              Number(s.deltas.Primetime || 0),
                              Number(s.deltas.Evening || 0),
                            ];
                            const segmentMax = Math.max(1, ...segmentValues);
                            const segmentTone = (value) => 0.15 + (Math.max(0, Number(value || 0)) / segmentMax) * 0.6;
                            return (
                              <>
                                <span className="summary-chip summary-chip-segment" style={{ "--chip-tone": segmentTone(s.deltas.Night) }}>
                                  Night <strong>{fmtNumber(s.deltas.Night)}</strong>
                                </span>
                                <span className="summary-chip summary-chip-segment" style={{ "--chip-tone": segmentTone(s.deltas.Morning) }}>
                                  Morning <strong>{fmtNumber(s.deltas.Morning)}</strong>
                                </span>
                                <span className="summary-chip summary-chip-segment" style={{ "--chip-tone": segmentTone(s.deltas.Afternoon) }}>
                                  Afternoon <strong>{fmtNumber(s.deltas.Afternoon)}</strong>
                                </span>
                                <span className="summary-chip summary-chip-segment" style={{ "--chip-tone": segmentTone(s.deltas.Primetime) }}>
                                  Primetime <strong>{fmtNumber(s.deltas.Primetime)}</strong>
                                </span>
                                <span className="summary-chip summary-chip-segment" style={{ "--chip-tone": segmentTone(s.deltas.Evening) }}>
                                  Evening <strong>{fmtNumber(s.deltas.Evening)}</strong>
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="summary-line">
                        <span className="summary-label">Estimated active hours/day</span>
                        <div className="summary-chips">
                          <span className={`summary-chip ${s.hoursByDay.Friday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>Fri <strong>{s.hoursByDay.Friday}h</strong></span>
                          <span className={`summary-chip ${s.hoursByDay.Saturday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>Sat <strong>{s.hoursByDay.Saturday}h</strong></span>
                          <span className={`summary-chip ${s.hoursByDay.Sunday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>Sun <strong>{s.hoursByDay.Sunday}h</strong></span>
                          <span className={`summary-chip ${s.hoursByDay.Monday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>Mon <strong>{s.hoursByDay.Monday}h</strong></span>
                          <span className={`summary-chip ${s.hoursByDay.Tuesday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>Tue <strong>{s.hoursByDay.Tuesday}h</strong></span>
                          <span className={`summary-chip ${s.hoursByDay.Wednesday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>Wed <strong>{s.hoursByDay.Wednesday}h</strong></span>
                          <span className={`summary-chip ${s.hoursByDay.Thursday > 0 ? "summary-chip-day-active" : "summary-chip-day-inactive"}`}>Thu <strong>{s.hoursByDay.Thursday}h</strong></span>
                          <span className="summary-chip summary-chip-total">Total <strong>{totalHours}h</strong></span>
                        </div>
                      </div>
                          </>
                        );
                      })()}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </main>
        <footer className="footer">Built by Vox | MIT License</footer>
      </div>
    </>
  );
}
