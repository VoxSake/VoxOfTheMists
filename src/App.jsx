import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isAnonymizedAccount,
  timeBucketFromLocalTime,
  downloadCsv,
} from "./utils";
import { api } from "./api/client";
import { useTimeZone } from "./hooks/useTimeZone";
import { usePersistedState } from "./hooks/usePersistedState";
import { useToast } from "./hooks/useToast.jsx";
import { useDashboardStats } from "./hooks/useDashboardStats";
import { useShareSettings } from "./hooks/useShareSettings";
import { usePaginatedRows } from "./hooks/usePaginatedRows";
import { useGuildCheckJob } from "./hooks/useGuildCheckJob";
import { useSortable } from "./hooks/useSortable";
import { useAccountSearchFilter } from "./hooks/useAccountSearchFilter";
import { useDashboardData } from "./hooks/useDashboardData";
import { ToastContainer } from "./components/Toast";
import { SettingsPanel } from "./components/SettingsPanel";
import { SectionNav } from "./components/SectionNav";
import { LeaderboardSection } from "./components/sections/LeaderboardSection";
import { StatsSection } from "./components/sections/StatsSection";
import {
  LEADERBOARD_CSV_HEADERS,
  ANOMALIES_CSV_HEADERS,
  buildDeltaCsvHeaders,
  mapAnomalyRowsForCsv,
} from "./utils/csvExports";

const loadRankMoversSection = () =>
  import("./components/sections/RankMoversSection").then((m) => ({ default: m.RankMoversSection }));
const loadWatchlistSection = () =>
  import("./components/sections/WatchlistSection").then((m) => ({ default: m.WatchlistSection }));
const loadGuildCheckSection = () =>
  import("./components/sections/GuildCheckSection").then((m) => ({ default: m.GuildCheckSection }));
const loadAnomaliesSection = () =>
  import("./components/sections/AnomaliesSection").then((m) => ({ default: m.AnomaliesSection }));
const loadResetImpactSection = () =>
  import("./components/sections/ResetImpactSection").then((m) => ({ default: m.ResetImpactSection }));
const loadConsistencySection = () =>
  import("./components/sections/ConsistencySection").then((m) => ({ default: m.ConsistencySection }));
const loadTopProgressionSection = () =>
  import("./components/sections/TopProgressionSection").then((m) => ({ default: m.TopProgressionSection }));
const loadCompareAccountsSection = () =>
  import("./components/sections/CompareAccountsSection").then((m) => ({ default: m.CompareAccountsSection }));

const RankMoversSection = lazy(loadRankMoversSection);
const WatchlistSection = lazy(loadWatchlistSection);
const GuildCheckSection = lazy(loadGuildCheckSection);
const AnomaliesSection = lazy(loadAnomaliesSection);
const ResetImpactSection = lazy(loadResetImpactSection);
const ConsistencySection = lazy(loadConsistencySection);
const TopProgressionSection = lazy(loadTopProgressionSection);
const CompareAccountsSection = lazy(loadCompareAccountsSection);

const SECTION_PREFETCHERS = {
  movers: loadRankMoversSection,
  anomalies: loadAnomaliesSection,
  "reset-impact": loadResetImpactSection,
  consistency: loadConsistencySection,
  watchlist: loadWatchlistSection,
  "guild-check": loadGuildCheckSection,
  progression: loadTopProgressionSection,
  compare: loadCompareAccountsSection,
};

/* ── Section navigation ── */
function parseBooleanTrue(raw) {
  return String(raw) === "1";
}

function parseBooleanNotZero(raw) {
  return String(raw) !== "0";
}

function parseBoundedInt(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseStringArray(raw, max = 10) {
  try {
    const parsed = JSON.parse(raw || "[]");
    const cleaned = Array.isArray(parsed)
      ? parsed.map((v) => String(v || "").trim()).filter(Boolean).slice(0, max)
      : [];
    return [...new Map(cleaned.map((v) => [v.toLowerCase(), v])).values()];
  } catch {
    return [];
  }
}
/* ÄÄ Main App ÄÄ */
function SectionFallback() {
  return (
    <section className="card">
      <p className="muted">Loading module...</p>
    </section>
  );
}

export default function App() {
  const { allZones, timeZone, setTimeZone } = useTimeZone();
  const { addToast } = useToast();
  const [metric, setMetric] = useState("weeklyKills");
  const [compareBaseline, setCompareBaseline] = useState("raw");
  const [deltaMetric, setDeltaMetric] = useState("weeklyKills");
  const [topDelta, setTopDelta] = usePersistedState("vox-top-delta", 30, {
    parse: (raw) => parseBoundedInt(raw, 30, 5, 200),
    serialize: (v) => String(v),
  });
  const [showTotalDelta, setShowTotalDelta] = usePersistedState("vox-show-total-delta", true, {
    parse: parseBooleanNotZero,
    serialize: (v) => (v ? "1" : "0"),
  });
  const [anomalyMinDelta, setAnomalyMinDelta] = usePersistedState("vox-anomaly-min-delta", 80, {
    parse: (raw) => parseBoundedInt(raw, 80, 10, 5000),
    serialize: (v) => String(v),
  });
  const [topLeaderboard, setTopLeaderboard] = usePersistedState("vox-top-leaderboard", 300, {
    parse: (raw) => parseBoundedInt(raw, 300, 1, 300),
    serialize: (v) => String(v),
  });
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardPageSize, setLeaderboardPageSize] = useState(50);
  const [moversPage, setMoversPage] = usePersistedState("vox-movers-page", 1, {
    parse: (raw) => parseBoundedInt(raw, 1, 1, 999),
    serialize: (v) => String(v),
  });
  const [moversPageSize, setMoversPageSize] = usePersistedState("vox-movers-page-size", 50, {
    parse: (raw) => parseBoundedInt(raw, 50, 10, 100),
    serialize: (v) => String(v),
  });
  const [anomaliesPage, setAnomaliesPage] = usePersistedState("vox-anomalies-page", 1, {
    parse: (raw) => parseBoundedInt(raw, 1, 1, 999),
    serialize: (v) => String(v),
  });
  const [anomaliesPageSize, setAnomaliesPageSize] = usePersistedState("vox-anomalies-page-size", 50, {
    parse: (raw) => parseBoundedInt(raw, 50, 10, 100),
    serialize: (v) => String(v),
  });
  const [topProgression, setTopProgression] = useState(10);
  const [scope, setScope] = useState("week");
  const [selectedWeekEnd, setSelectedWeekEnd] = usePersistedState("vox-selected-week-end", "", {
    parse: (raw) => String(raw || "").trim(),
    serialize: (v) => String(v || ""),
  });
  const [allTimeRange, setAllTimeRange] = useState("30d");
  const [search, setSearch] = useState("");
  const [compareAccounts, setCompareAccounts] = usePersistedState("vox-compare-accounts", [], {
    parse: (raw) => parseStringArray(raw, 10),
  });
  const [resetImpactWindow, setResetImpactWindow] = useState(3);
  const [consistencyTop, setConsistencyTop] = usePersistedState("vox-consistency-top", 20, {
    parse: (raw) => parseBoundedInt(raw, 20, 5, 100),
    serialize: (v) => String(v),
  });
  const [watchlistAccounts, setWatchlistAccounts] = usePersistedState("vox-watchlist", [], {
    parse: (raw) => parseStringArray(raw, 10),
  });
  const [watchlistInput, setWatchlistInput] = useState("");
  const [watchlistSuggestions, setWatchlistSuggestions] = useState([]);
  const [watchlistMinGain, setWatchlistMinGain] = usePersistedState("vox-watchlist-min-gain", 30, {
    parse: (raw) => parseBoundedInt(raw, 30, 0, 5000),
    serialize: (v) => String(v),
  });
  const [watchlistMinRankUp, setWatchlistMinRankUp] = usePersistedState("vox-watchlist-min-rankup", 3, {
    parse: (raw) => parseBoundedInt(raw, 3, 0, 200),
    serialize: (v) => String(v),
  });
  const [compareInput, setCompareInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [themeDark, setThemeDark] = usePersistedState("vox-theme", true, {
    parse: (raw) => String(raw) !== "light",
    serialize: (v) => (v ? "dark" : "light"),
  });
  const [plainMode, setPlainMode] = usePersistedState("vox-plain-mode", false, {
    parse: parseBooleanTrue,
    serialize: (v) => (v ? "1" : "0"),
  });
  const [hideAnonymized, setHideAnonymized] = usePersistedState("vox-hide-anonymized", false, {
    parse: parseBooleanTrue,
    serialize: (v) => (v ? "1" : "0"),
  });
  const [nowMs, setNowMs] = useState(Date.now());
  const suggestTimer = useRef(null);
  const watchlistSuggestTimer = useRef(null);
  const prefetchedSectionChunksRef = useRef(new Set());
  const guildCheck = useGuildCheckJob({ addToast });

  useEffect(() => {
    const prefetched = prefetchedSectionChunksRef.current;
    const prefetchById = (id) => {
      const key = String(id || "");
      if (!key || prefetched.has(key)) return;
      const prefetch = SECTION_PREFETCHERS[key];
      if (!prefetch) return;
      prefetched.add(key);
      prefetch().catch(() => {
        prefetched.delete(key);
      });
    };

    if (typeof IntersectionObserver !== "function") {
      Object.keys(SECTION_PREFETCHERS).forEach(prefetchById);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          prefetchById(entry.target.id);
          observer.unobserve(entry.target);
        }
      },
      { root: null, rootMargin: "300px 0px", threshold: 0.01 }
    );

    Object.keys(SECTION_PREFETCHERS).forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dark", themeDark);
  }, [themeDark]);

  useEffect(() => {
    document.body.classList.toggle("plain-mode", plainMode);
  }, [plainMode]);

  const isVisibleAccount = useCallback(
    (name) => !hideAnonymized || !isAnonymizedAccount(name),
    [hideAnonymized]
  );

  useEffect(() => {
    if (!hideAnonymized) return;
    setCompareAccounts((prev) => prev.filter((a) => !isAnonymizedAccount(a)));
    setWatchlistAccounts((prev) => prev.filter((a) => !isAnonymizedAccount(a)));
    setSuggestions((prev) => prev.filter((a) => !isAnonymizedAccount(a)));
    setWatchlistSuggestions((prev) => prev.filter((a) => !isAnonymizedAccount(a)));
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
  const effectiveWatchlistAccounts = useMemo(
    () => (hideAnonymized ? watchlistAccounts.filter((a) => !isAnonymizedAccount(a)) : watchlistAccounts),
    [watchlistAccounts, hideAnonymized]
  );
  const {
    latestSnapshot,
    snapshotCount,
    entries,
    progressionPayload,
    comparePayload,
    deltaPayload,
    anomaliesPayload,
    resetImpactPayload,
    consistencyPayload,
    watchlistPayload,
    healthPayload,
    weeklyReport,
    weekOptions,
    snapshotRunning,
    appwriteSyncRunning,
    initialLoading,
    refreshAll,
    runManualSnapshot,
    runManualAppwriteSync,
  } = useDashboardData({
    addToast,
    topLeaderboard,
    topProgression,
    scope,
    allTimeDaysParam,
    effectiveCompareAccounts,
    topDelta,
    deltaMetric,
    anomalyMinDelta,
    resetImpactWindow,
    consistencyTop,
    effectiveWatchlistAccounts,
    watchlistMinGain,
    watchlistMinRankUp,
    selectedWeekEnd: selectedWeekEnd || null,
  });

  useEffect(() => {
    if (!selectedWeekEnd) return;
    if (!weekOptions.some((w) => String(w?.weekEndUtc || "") === selectedWeekEnd)) {
      setSelectedWeekEnd("");
    }
  }, [selectedWeekEnd, weekOptions, setSelectedWeekEnd]);

  function addWatchlistAccount(value) {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    setWatchlistAccounts((prev) => {
      if (prev.some((v) => v.toLowerCase() === normalized.toLowerCase())) return prev;
      return [...prev, normalized].slice(0, 10);
    });
    setWatchlistInput("");
  }

  function removeWatchlistAccount(account) {
    setWatchlistAccounts((prev) => prev.filter((v) => v !== account));
  }  function handleLeaderboardPageSizeChange(size) {
    setLeaderboardPageSize(size);
    setLeaderboardPage(1);
  }

  function handleMoversPageSizeChange(size) {
    setMoversPageSize(size);
    setMoversPage(1);
  }

  function handleAnomaliesPageSizeChange(size) {
    setAnomaliesPageSize(size);
    setAnomaliesPage(1);
  }

  /* ── Autocomplete ── */
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await api.searchAccounts({ query: compareInput, limit: 12, signal: ac.signal });
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

  useEffect(() => {
    const normalized = watchlistInput.trim();
    if (!normalized) {
      setWatchlistSuggestions([]);
      return undefined;
    }
    const ac = new AbortController();
    let cancelled = false;
    clearTimeout(watchlistSuggestTimer.current);
    watchlistSuggestTimer.current = setTimeout(async () => {
      try {
        const data = await api.searchAccounts({ query: watchlistInput, limit: 12, signal: ac.signal });
        if (cancelled) return;
        const base = data.accounts || [];
        setWatchlistSuggestions(hideAnonymized ? base.filter((s) => !isAnonymizedAccount(s)) : base);
      } catch {
        // Ignore aborted/transient autocomplete failures.
      }
    }, 120);
    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(watchlistSuggestTimer.current);
    };
  }, [watchlistInput, hideAnonymized]);

  const {
    searchQuery,
    filteredEntries,
    filteredProgressionPayload,
    filteredComparePayload,
    filteredDeltaRows,
    filteredAnomalies,
    filteredResetImpactRows,
    filteredConsistencyRows,
    filteredWatchlistRows,
  } = useAccountSearchFilter({
    entries,
    search,
    hideAnonymized,
    isVisibleAccount,
    progressionPayload,
    comparePayload,
    deltaPayload,
    anomaliesPayload,
    resetImpactPayload,
    consistencyPayload,
    watchlistPayload,
  });

  useEffect(() => {
    setLeaderboardPage(1);
  }, [searchQuery, hideAnonymized, topLeaderboard]);

  useEffect(() => {
    setMoversPage(1);
  }, [topDelta, deltaMetric, scope, hideAnonymized]);

  useEffect(() => {
    setAnomaliesPage(1);
  }, [anomalyMinDelta, scope, hideAnonymized]);

  /* ── Sortable tables ── */
  const leaderboardSort = useSortable(filteredEntries, { key: "rank", dir: "asc" });
  const deltaSort = useSortable(filteredDeltaRows);
  const anomalySort = useSortable(filteredAnomalies);
  const resetImpactSort = useSortable(filteredResetImpactRows, { key: "gain", dir: "desc" });
  const consistencySort = useSortable(filteredConsistencyRows, { key: "consistencyScore", dir: "desc" });
  const watchlistSort = useSortable(filteredWatchlistRows, { key: "weeklyGain", dir: "desc" });

  /* ── Activity summaries ── */
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
      const localPartsFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        weekday: "long",
      });
      for (let i = 1; i < points.length; i += 1) {
        const prev = Number(points[i - 1].weeklyKills || 0);
        const cur = Number(points[i].weeklyKills || 0);
        const delta = Math.max(0, cur - prev);
        if (delta <= 0) continue;
        const startMs = Date.parse(points[i - 1].createdAt);
        const endMs = Date.parse(points[i].createdAt);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          const fallbackParts = localPartsFormatter.formatToParts(new Date(points[i].createdAt));
          const fallbackHour = Number(fallbackParts.find((p) => p.type === "hour")?.value || "0");
          const fallbackMinute = Number(fallbackParts.find((p) => p.type === "minute")?.value || "0");
          const fallbackWeekday = String(fallbackParts.find((p) => p.type === "weekday")?.value || "");
          const fallbackBucket = timeBucketFromLocalTime(fallbackHour, fallbackMinute);
          deltas[fallbackBucket] += delta;
          if (Object.hasOwn(hoursByDay, fallbackWeekday)) hoursByDay[fallbackWeekday] += 1;
          continue;
        }

        // Attribute kills to the midpoint of the interval (less biased than using only the end timestamp).
        const midMs = startMs + Math.floor((endMs - startMs) / 2);
        const parts = localPartsFormatter.formatToParts(new Date(midMs));
        const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
        const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");
        const weekday = String(parts.find((p) => p.type === "weekday")?.value || "");
        const bucket = timeBucketFromLocalTime(hour, minute);
        deltas[bucket] += delta;

        // Conservative active time estimate: max 1 hour per positive interval.
        const durationMinutes = Math.max(1, Math.floor((endMs - startMs) / 60000));
        const creditedHours = Math.min(60, durationMinutes) / 60;
        if (Object.hasOwn(hoursByDay, weekday)) {
          hoursByDay[weekday] += creditedHours;
        }
      }

      for (const day of dayOrder) {
        hoursByDay[day] = Math.round(hoursByDay[day] || 0);
      }

      const total = Object.values(deltas).reduce((a, b) => a + b, 0);
      const sorted = Object.entries(deltas).sort((a, b) => b[1] - a[1]);
      const [dominant, dominantValue] = sorted[0];
      const confidence = total > 0 ? Math.round((dominantValue / total) * 100) : 0;
      return { account, dominant: total > 0 ? dominant : "No increase detected", confidence, deltas, hoursByDay };
    });
  }, [filteredComparePayload, timeZone]);

  const compareProjectionShare = useMemo(() => {
    if (!comparePayload?.weekWindow?.endUtc) return { leader: null, rows: [] };
    if (!filteredComparePayload?.series) return { leader: null, rows: [] };
    const endMs = Date.parse(comparePayload.weekWindow.endUtc);
    if (!Number.isFinite(endMs)) return { leader: null, rows: [] };

    const rows = [];
    for (const [account, points] of Object.entries(filteredComparePayload.series)) {
      const ordered = [...(points || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      if (ordered.length < 2) continue;
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      const firstMs = Date.parse(first.createdAt);
      const lastMs = Date.parse(last.createdAt);
      const firstWeekly = Number(first?.weeklyKills || 0);
      const lastWeekly = Number(last?.weeklyKills || 0);
      if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs) || lastMs <= firstMs) continue;
      if (!Number.isFinite(firstWeekly) || !Number.isFinite(lastWeekly)) continue;

      const elapsedHours = Math.max(0, (lastMs - firstMs) / 3600000);
      const weeklyGain = Math.max(0, lastWeekly - firstWeekly);
      const avgPerHour = elapsedHours > 0 ? weeklyGain / elapsedHours : 0;
      const remainingHours = Math.max(0, (endMs - lastMs) / 3600000);
      const projectedGain = avgPerHour * remainingHours;
      const projectedWeekly = lastWeekly + projectedGain;

      rows.push({
        account,
        avgPerHour,
        weeklyGain,
        projectedGain,
        projectedWeekly,
      });
    }

    const sortedRows = rows.sort((a, b) => b.projectedWeekly - a.projectedWeekly);
    return { leader: sortedRows[0] || null, rows: sortedRows };
  }, [comparePayload, filteredComparePayload]);

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
    return rows.find((r) => isVisibleAccount(r.accountName)) || null;
  }, [weeklyReport, hideAnonymized]);

  const weeklyTopAnomaly = useMemo(() => {
    const rows = weeklyReport?.anomalies?.anomalies || [];
    if (!rows.length) return null;
    return rows.find((r) => isVisibleAccount(r.accountName)) || null;
  }, [weeklyReport, hideAnonymized]);

  const canRunManualSnapshot = healthPayload != null && !healthPayload.appwriteSyncEnabled;
  const canRunManualAppwriteSync =
    healthPayload != null && healthPayload.appwriteSyncEnabled && healthPayload.appwriteSyncConfigured;
  const appwriteSyncBusy = appwriteSyncRunning || Boolean(healthPayload?.appwriteSync?.running);
  const {
    nextSnapshotIso,
    ingestionStatus,
    lastPipelineEventIso,
    entriesPerSnapshot,
    velocityTotalWeeklyDelta,
    velocityAvgPerHour,
    velocityTopMover,
  } = useDashboardStats({
    healthPayload,
    latestSnapshot,
    nowMs,
    snapshotCount,
    filteredDeltaRows,
    deltaPayload,
  });

  const leaderboardPagination = usePaginatedRows(leaderboardSort.sorted, leaderboardPage, leaderboardPageSize);
  const moversPagination = usePaginatedRows(deltaSort.sorted, moversPage, moversPageSize);
  const anomaliesPagination = usePaginatedRows(anomalySort.sorted, anomaliesPage, anomaliesPageSize);

  const shareSettings = useShareSettings({
    addToast,
    timeZone,
    shareData: {
      latestSnapshot,
      nextSnapshotIso,
      ingestionStatus,
      lastPipelineEventIso,
      snapshotCount,
      healthPayload,
      entriesPerSnapshot,
      weekReset,
      velocityTotalWeeklyDelta,
      velocityAvgPerHour,
      velocityTopMover,
      leaderboardRows: leaderboardSort.sorted,
      moverRows: deltaSort.sorted,
      anomalyRows: anomalySort.sorted,
      resetImpactRows: resetImpactSort.sorted,
      consistencyRows: consistencySort.sorted,
      compareSummaries,
      compareProjectionShare,
    },
  });

  /* ── CSV exports ── */
  function exportLeaderboardCsv() {
    downloadCsv(
      `vox-leaderboard-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      LEADERBOARD_CSV_HEADERS,
      filteredEntries
    );
    addToast({ title: "Export", description: "Leaderboard CSV downloaded.", variant: "success", duration: 3000 });
  }

  function exportDeltaCsv() {
    const headers = buildDeltaCsvHeaders(showTotalDelta);
    downloadCsv(
      `vox-delta-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      headers,
      filteredDeltaRows
    );
    addToast({ title: "Export", description: "Delta CSV downloaded.", variant: "success", duration: 3000 });
  }

  function exportAnomaliesCsv() {
    const rows = mapAnomalyRowsForCsv(filteredAnomalies, timeZone);
    downloadCsv(
      `vox-anomalies-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      ANOMALIES_CSV_HEADERS,
      rows
    );
    addToast({ title: "Export", description: "Anomalies CSV downloaded.", variant: "success", duration: 3000 });
  }

  /* ÄÄ Compare account management ÄÄ */
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

  function handleWatchlistInputChange(value) {
    setWatchlistInput(value);
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    const matched = watchlistSuggestions.find((s) => s.toLowerCase() === normalized);
    if (matched) addWatchlistAccount(matched);
  }

  /* ── Render ── */
  return (
    <>
      <div className="shell">
        <header className="topbar">
          <div className="title-wrap">
            <p className="eyebrow">Guild Wars 2 - WvW Analytics</p>
            <h1>Vox of the Mists</h1>
          </div>
          <div className="toolbar">
            <select
              value={selectedWeekEnd}
              onChange={(e) => setSelectedWeekEnd(e.target.value)}
              title="Select archived week"
            >
              <option value="">Current Live Week</option>
              {weekOptions.map((w) => (
                <option key={w.weekEndUtc} value={w.weekEndUtc}>
                  {w.label}
                </option>
              ))}
            </select>
            <button className="btn ghost" onClick={shareSettings.exportShareSnapshotHtml}>
              Share Snapshot
            </button>
            <button className="btn ghost" onClick={() => shareSettings.setSettingsOpen(true)}>
              Settings
            </button>
          </div>
        </header>

        <SectionNav />

        <StatsSection
          initialLoading={initialLoading}
          latestSnapshot={latestSnapshot}
          healthPayload={healthPayload}
          timeZone={timeZone}
          nextSnapshotIso={nextSnapshotIso}
          ingestionStatus={ingestionStatus}
          lastPipelineEventIso={lastPipelineEventIso}
          snapshotCount={snapshotCount}
          entriesPerSnapshot={entriesPerSnapshot}
          weekReset={weekReset}
          velocityTotalWeeklyDelta={velocityTotalWeeklyDelta}
          velocityAvgPerHour={velocityAvgPerHour}
          velocityTopMover={velocityTopMover}
        />

        <main className="layout">
          <LeaderboardSection
            search={search}
            setSearch={setSearch}
            leaderboardPageSize={leaderboardPageSize}
            setLeaderboardPageSize={handleLeaderboardPageSizeChange}
            topLeaderboard={topLeaderboard}
            setTopLeaderboard={setTopLeaderboard}
            canRunManualSnapshot={canRunManualSnapshot}
            onRefresh={() => {
              refreshAll().catch(console.error);
              addToast({ title: "Refreshing", description: "Fetching latest data...", variant: "default", duration: 2000 });
            }}
            runManualSnapshot={runManualSnapshot}
            snapshotRunning={snapshotRunning}
            canRunManualAppwriteSync={canRunManualAppwriteSync}
            appwriteSyncBusy={appwriteSyncBusy}
            runManualAppwriteSync={runManualAppwriteSync}
            exportLeaderboardCsv={exportLeaderboardCsv}
            latestSnapshot={latestSnapshot}
            timeZone={timeZone}
            leaderboardStartIndex={leaderboardPagination.startIndex}
            leaderboardEndIndex={leaderboardPagination.endIndex}
            leaderboardTotalRows={leaderboardPagination.totalRows}
            clampedLeaderboardPage={leaderboardPagination.clampedPage}
            leaderboardTotalPages={leaderboardPagination.totalPages}
            onPrevPage={() => setLeaderboardPage((p) => Math.max(1, p - 1))}
            onNextPage={() => setLeaderboardPage((p) => Math.min(leaderboardPagination.totalPages, p + 1))}
            healthPayload={healthPayload}
            initialLoading={initialLoading}
            leaderboardSort={leaderboardSort}
            leaderboardVisibleRows={leaderboardPagination.visibleRows}
          />

          <Suspense fallback={<SectionFallback />}>
            <RankMoversSection
              deltaMetric={deltaMetric}
              setDeltaMetric={setDeltaMetric}
              showTotalDelta={showTotalDelta}
              setShowTotalDelta={setShowTotalDelta}
              moversPageSize={moversPageSize}
              setMoversPageSize={handleMoversPageSizeChange}
              topDelta={topDelta}
              setTopDelta={setTopDelta}
              exportDeltaCsv={exportDeltaCsv}
              scope={scope}
              deltaPayload={deltaPayload}
              timeZone={timeZone}
              movers={movers}
              moversStartIndex={moversPagination.startIndex}
              moversEndIndex={moversPagination.endIndex}
              moversTotalRows={moversPagination.totalRows}
              clampedMoversPage={moversPagination.clampedPage}
              moversTotalPages={moversPagination.totalPages}
              onPrevPage={() => setMoversPage((p) => Math.max(1, p - 1))}
              onNextPage={() => setMoversPage((p) => Math.min(moversPagination.totalPages, p + 1))}
              deltaSort={deltaSort}
              moversVisibleRows={moversPagination.visibleRows}
            />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <AnomaliesSection
              anomalyMinDelta={anomalyMinDelta}
              setAnomalyMinDelta={setAnomalyMinDelta}
              anomaliesPageSize={anomaliesPageSize}
              setAnomaliesPageSize={handleAnomaliesPageSizeChange}
              exportAnomaliesCsv={exportAnomaliesCsv}
              anomalySort={anomalySort}
              timeZone={timeZone}
              anomaliesStartIndex={anomaliesPagination.startIndex}
              anomaliesEndIndex={anomaliesPagination.endIndex}
              anomaliesTotalRows={anomaliesPagination.totalRows}
              clampedAnomaliesPage={anomaliesPagination.clampedPage}
              anomaliesTotalPages={anomaliesPagination.totalPages}
              onPrevPage={() => setAnomaliesPage((p) => Math.max(1, p - 1))}
              onNextPage={() => setAnomaliesPage((p) => Math.min(anomaliesPagination.totalPages, p + 1))}
              anomaliesVisibleRows={anomaliesPagination.visibleRows}
            />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <ResetImpactSection
              resetImpactWindow={resetImpactWindow}
              setResetImpactWindow={setResetImpactWindow}
              resetImpactPayload={resetImpactPayload}
              timeZone={timeZone}
              resetImpactSort={resetImpactSort}
            />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <ConsistencySection
              consistencyTop={consistencyTop}
              setConsistencyTop={setConsistencyTop}
              consistencySort={consistencySort}
            />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <WatchlistSection
              effectiveWatchlistAccounts={effectiveWatchlistAccounts}
              removeWatchlistAccount={removeWatchlistAccount}
              watchlistInput={watchlistInput}
              handleWatchlistInputChange={handleWatchlistInputChange}
              watchlistSuggestions={watchlistSuggestions}
              addWatchlistAccount={addWatchlistAccount}
              watchlistMinGain={watchlistMinGain}
              setWatchlistMinGain={setWatchlistMinGain}
              watchlistMinRankUp={watchlistMinRankUp}
              setWatchlistMinRankUp={setWatchlistMinRankUp}
              watchlistSort={watchlistSort}
            />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <GuildCheckSection
              query={guildCheck.query}
              setQuery={guildCheck.setQuery}
              region={guildCheck.region}
              setRegion={guildCheck.setRegion}
              running={guildCheck.running}
              onRun={guildCheck.runSearch}
              status={guildCheck.status}
              rows={guildCheck.rows}
              page={guildCheck.page}
              pageSize={guildCheck.pageSize}
              setPageSize={guildCheck.setPageSize}
              onPrevPage={guildCheck.onPrevPage}
              onNextPage={guildCheck.onNextPage}
            />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <TopProgressionSection
              topProgression={topProgression}
              setTopProgression={setTopProgression}
              metric={metric}
              setMetric={setMetric}
              scope={scope}
              setScope={setScope}
              allTimeRange={allTimeRange}
              setAllTimeRange={setAllTimeRange}
              progressionPayload={progressionPayload}
              timeZone={timeZone}
              filteredProgressionPayload={filteredProgressionPayload}
              themeDark={themeDark}
            />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <CompareAccountsSection
              effectiveCompareAccounts={effectiveCompareAccounts}
              removeCompareAccount={removeCompareAccount}
              compareInput={compareInput}
              handleCompareInputChange={handleCompareInputChange}
              suggestions={suggestions}
              addCompareAccount={addCompareAccount}
              setCompareBaseline={setCompareBaseline}
              compareBaseline={compareBaseline}
              scope={scope}
              allTimeRange={allTimeRange}
              setAllTimeRange={setAllTimeRange}
              comparePayload={comparePayload}
              timeZone={timeZone}
              filteredComparePayload={filteredComparePayload}
              metric={metric}
              themeDark={themeDark}
              compareSummaries={compareSummaries}
            />
          </Suspense>
        </main>
        <footer className="footer">Built by Vox | MIT License</footer>
      </div>
      <SettingsPanel
        isOpen={shareSettings.settingsOpen}
        onClose={() => shareSettings.setSettingsOpen(false)}
        allZones={allZones}
        timeZone={timeZone}
        setTimeZone={setTimeZone}
        hideAnonymized={hideAnonymized}
        setHideAnonymized={setHideAnonymized}
        themeDark={themeDark}
        setThemeDark={setThemeDark}
        plainMode={plainMode}
        setPlainMode={setPlainMode}
        discordWebhookEnabled={shareSettings.discordWebhookEnabled}
        setDiscordWebhookEnabled={shareSettings.setDiscordWebhookEnabled}
        discordWebhookUrl={shareSettings.discordWebhookUrl}
        setDiscordWebhookUrl={shareSettings.setDiscordWebhookUrl}
        onTestDiscordWebhook={shareSettings.testDiscordWebhook}
        webhookTesting={shareSettings.webhookTesting}
      />
      <ToastContainer />
    </>
  );
}













