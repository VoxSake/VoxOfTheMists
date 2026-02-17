import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  fmtNumber,
  isAnonymizedAccount,
  formatTimestamp,
  timeBucketFromLocalTime,
  downloadCsv,
} from "./utils";
import { api } from "./api/client";
import { useTimeZone } from "./hooks/useTimeZone";
import { usePersistedState } from "./hooks/usePersistedState";
import { useToast } from "./hooks/useToast.jsx";
import { useDashboardStats } from "./hooks/useDashboardStats";
import { useShareSettings } from "./hooks/useShareSettings";
import { ToastContainer } from "./components/Toast";
import { SettingsPanel } from "./components/SettingsPanel";
import { LeaderboardSection } from "./components/sections/LeaderboardSection";
import { StatsSection } from "./components/sections/StatsSection";

const loadRankMoversSection = () =>
  import("./components/sections/RankMoversSection").then((m) => ({ default: m.RankMoversSection }));
const loadWatchlistSection = () =>
  import("./components/sections/WatchlistSection").then((m) => ({ default: m.WatchlistSection }));
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
  progression: loadTopProgressionSection,
  compare: loadCompareAccountsSection,
};

/* ── Sortable-data hook ── */
function useSortable(data, defaultSort = null) {
  const [sort, setSort] = useState(defaultSort);

  const sorted = useMemo(() => {
    if (!sort || !data.length) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sort.key];
      const bVal = b[sort.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const isNum = typeof aVal === "number" || typeof bVal === "number";
      const cmp = isNum ? Number(aVal) - Number(bVal) : String(aVal).localeCompare(String(bVal));
      return sort.dir === "desc" ? -cmp : cmp;
    });
  }, [data, sort]);

  const toggle = (key) => {
    setSort((prev) => ({
      key,
      dir: prev?.key === key && prev.dir === "asc" ? "desc" : "asc",
    }));
  };

  const indicator = (key) => {
    if (sort?.key !== key) return "";
    return sort.dir === "asc" ? " ▲" : " ▼";
  };

  return { sorted, toggle, indicator };
}

/* ── Section navigation ── */
const NAV_SECTIONS = [
  { id: "stats", label: "Overview" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "movers", label: "Movers" },
  { id: "anomalies", label: "Anomalies" },
  { id: "reset-impact", label: "Reset Impact" },
  { id: "consistency", label: "Consistency" },
  { id: "watchlist", label: "Watchlist" },
  { id: "progression", label: "Progression" },
  { id: "compare", label: "Compare" },
];

function SectionNav() {
  const [activeId, setActiveId] = useState("stats");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );
    NAV_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="section-nav">
      {NAV_SECTIONS.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className={activeId === id ? "active" : ""}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

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
  const [topDelta, setTopDelta] = useState(30);
  const [showTotalDelta, setShowTotalDelta] = usePersistedState("vox-show-total-delta", true, {
    parse: parseBooleanNotZero,
    serialize: (v) => (v ? "1" : "0"),
  });
  const [anomalyMinDelta, setAnomalyMinDelta] = useState(80);
  const [topLeaderboard, setTopLeaderboard] = useState(300);
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
  const [allTimeRange, setAllTimeRange] = useState("30d");
  const [latestSnapshot, setLatestSnapshot] = useState(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState("");
  const [progressionPayload, setProgressionPayload] = useState(null);
  const [compareAccounts, setCompareAccounts] = usePersistedState("vox-compare-accounts", [], {
    parse: (raw) => parseStringArray(raw, 10),
  });
  const [comparePayload, setComparePayload] = useState(null);
  const [deltaPayload, setDeltaPayload] = useState(null);
  const [anomaliesPayload, setAnomaliesPayload] = useState(null);
  const [resetImpactWindow, setResetImpactWindow] = useState(3);
  const [resetImpactPayload, setResetImpactPayload] = useState(null);
  const [consistencyTop, setConsistencyTop] = useState(20);
  const [consistencyPayload, setConsistencyPayload] = useState(null);
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
  const [watchlistPayload, setWatchlistPayload] = useState(null);
  const [healthPayload, setHealthPayload] = useState(null);
  const [weeklyReport, setWeeklyReport] = useState(null);
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
  const [snapshotRunning, setSnapshotRunning] = useState(false);
  const [appwriteSyncRunning, setAppwriteSyncRunning] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [initialLoading, setInitialLoading] = useState(true);
  const suggestTimer = useRef(null);
  const watchlistSuggestTimer = useRef(null);
  const lastFinishedAtRef = useRef(null);
  const statusPollTimerRef = useRef(null);
  const latestSnapshotIdRef = useRef(null);
  const prefetchedSectionChunksRef = useRef(new Set());
  latestSnapshotIdRef.current = latestSnapshot?.snapshotId || null;

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

  const isVisibleAccount = (name) => !hideAnonymized || !isAnonymizedAccount(name);

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
  const compareAccountsRef = useRef(effectiveCompareAccounts);
  const scopeRef = useRef(scope);
  const allTimeDaysParamRef = useRef(allTimeDaysParam);
  compareAccountsRef.current = effectiveCompareAccounts;
  scopeRef.current = scope;
  allTimeDaysParamRef.current = allTimeDaysParam;

  /* ── Data loading ── */
  async function loadOverview() {
    const [latest, snapshots] = await Promise.all([
      api.getLatest(topLeaderboard),
      api.getSnapshots(),
    ]);
    setLatestSnapshot(latest.snapshot);
    setEntries(latest.entries || []);
    setSnapshotCount((snapshots.snapshots || []).length);
  }

  async function loadProgression() {
    const payload = await api.getProgressionTop({ top: topProgression, scope, days: allTimeDaysParam });
    setProgressionPayload(payload);
  }

  async function loadCompare(accounts = compareAccountsRef.current) {
    if (!accounts.length) {
      setComparePayload(null);
      return;
    }
    const scopeValue = scopeRef.current;
    const daysValue = allTimeDaysParamRef.current;
    const payload = await api.getCompare({ accounts, scope: scopeValue, days: daysValue });
    setComparePayload(payload);
  }

  async function loadDelta() {
    const payload = await api.getLeaderboardDelta({ top: topDelta, metric: deltaMetric, scope });
    setDeltaPayload(payload);
  }

  async function loadAnomalies() {
    const payload = await api.getAnomalies({ top: 20, minDeltaAbs: anomalyMinDelta, lookbackHours: 72, scope });
    setAnomaliesPayload(payload);
  }

  async function loadResetImpact() {
    const windowHours = Math.max(1, Math.min(24, Number(resetImpactWindow || 3)));
    const payload = await api.getResetImpact({ top: 20, windowHours });
    setResetImpactPayload(payload);
  }

  async function loadConsistency() {
    const payload = await api.getConsistency({ top: consistencyTop, scope, days: allTimeDaysParam });
    setConsistencyPayload(payload);
  }

  async function loadWatchlist() {
    if (!effectiveWatchlistAccounts.length) {
      setWatchlistPayload(null);
      return;
    }
    const payload = await api.getWatchlist({
      accounts: effectiveWatchlistAccounts,
      minGain: watchlistMinGain,
      minRankUp: watchlistMinRankUp,
      scope,
    });
    setWatchlistPayload(payload);
  }

  async function loadHealth() {
    const payload = await api.getHealth();
    setHealthPayload(payload);
    setAppwriteSyncRunning(Boolean(payload?.appwriteSync?.running));
  }

  async function loadWeeklyReport() {
    setWeeklyReport(await api.getWeeklyReport());
  }

  async function refreshAll() {
    await Promise.all([
      loadOverview(),
      loadProgression(),
      loadCompare(),
      loadDelta(),
      loadAnomalies(),
      loadResetImpact(),
      loadConsistency(),
      loadWatchlist(),
      loadHealth(),
      loadWeeklyReport(),
    ]);
  }

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
  }

  async function runManualSnapshot() {
    if (snapshotRunning) return;
    setSnapshotRunning(true);
    addToast({ title: "Snapshot", description: "Running snapshot...", variant: "default", duration: 3000 });
    try {
      await api.runManualSnapshot();
      await refreshAll();
      addToast({ title: "Snapshot Complete", description: "Data has been refreshed.", variant: "success" });
    } catch (error) {
      addToast({ title: "Snapshot Failed", description: error.message, variant: "error" });
    } finally {
      setSnapshotRunning(false);
    }
  }

  async function runManualAppwriteSync() {
    if (appwriteSyncRunning) return;
    setAppwriteSyncRunning(true);
    addToast({ title: "Appwrite Sync", description: "Running sync...", variant: "default", duration: 3000 });
    try {
      const payload = await api.runManualAppwriteSync();
      const result = payload?.result || {};
      const importedSnapshots = Math.max(0, Number(result.importedSnapshots || 0));
      const importedEntries = Math.max(0, Number(result.importedEntries || 0));
      const fetched = Math.max(0, Number(result.fetched || 0));

      if (importedSnapshots > 0) {
        await refreshAll();
        addToast({
          title: "Appwrite Sync Complete",
          description: `Imported ${fmtNumber(importedSnapshots)} snapshot(s), ${fmtNumber(importedEntries)} entries.`,
          variant: "success",
        });
      } else {
        await loadHealth().catch(() => {});
        const description =
          fetched > 0
            ? `Checked ${fmtNumber(fetched)} new snapshot(s), but none were imported.`
            : "No new snapshots found in Appwrite.";
        addToast({
          title: "Appwrite Sync",
          description,
          variant: "default",
          duration: 4500,
        });
      }
    } catch (error) {
      addToast({ title: "Appwrite Sync Failed", description: error.message, variant: "error" });
    } finally {
      setAppwriteSyncRunning(false);
    }
  }

  async function fetchSnapshotStatus() {
    try {
      const status = await api.getSnapshotStatus();
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
        await refreshAll();
        refreshed = true;
        if (status.lastTrigger === "hourly") {
          addToast({ title: "Auto Snapshot", description: "Hourly snapshot done — data refreshed.", variant: "success" });
        }
      }

      const health = await api.getHealth();
      setHealthPayload(health);
      setAppwriteSyncRunning(Boolean(health?.appwriteSync?.running));
      const serverLatestSnapshotId = health?.latestSnapshot?.snapshotId || null;
      const hasNewLatestSnapshot =
        Boolean(serverLatestSnapshotId) && serverLatestSnapshotId !== latestSnapshotIdRef.current;
      if (!refreshed && hasNewLatestSnapshot) {
        await refreshAll();
        if (health?.appwriteSyncEnabled) {
          addToast({ title: "Appwrite Sync", description: "Snapshot synced — data refreshed.", variant: "success" });
        }
      }
    } catch {
      // Ignore transient polling errors.
    }
  }

  /* ── Initial load ── */
  useEffect(() => {
    loadOverview()
      .then(() => setInitialLoading(false))
      .catch((err) => {
        setInitialLoading(false);
        console.error(err);
      });
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
    loadResetImpact().catch(console.error);
  }, [resetImpactWindow]);

  useEffect(() => {
    loadConsistency().catch(console.error);
  }, [consistencyTop, scope, allTimeRange]);

  useEffect(() => {
    loadWatchlist().catch(console.error);
  }, [effectiveWatchlistAccounts, watchlistMinGain, watchlistMinRankUp, scope]);

  useEffect(() => {
    loadHealth().catch(console.error);
    loadWeeklyReport().catch(console.error);
  }, []);

  /* ── Status polling ── */
  useEffect(() => {
    let cancelled = false;
    const nextDelayMs = () => {
      const baseMs = 45_000;
      const jitterMs = Math.floor(Math.random() * 30_000);
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
    const initialJitter = Math.floor(Math.random() * 12_000);
    schedule(initialJitter);
    return () => {
      cancelled = true;
      clearTimeout(statusPollTimerRef.current);
    };
  }, []);

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

  /* ── Filtered / computed data ── */
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = entries.filter((e) => isVisibleAccount(e.accountName));
    if (!q) return base;
    return base.filter((e) => e.accountName.toLowerCase().includes(q));
  }, [entries, search, hideAnonymized]);

  useEffect(() => {
    setLeaderboardPage(1);
  }, [search, hideAnonymized, topLeaderboard, leaderboardPageSize]);

  useEffect(() => {
    setMoversPage(1);
  }, [topDelta, deltaMetric, scope, hideAnonymized, moversPageSize]);

  useEffect(() => {
    setAnomaliesPage(1);
  }, [anomalyMinDelta, scope, hideAnonymized, anomaliesPageSize]);

  const filteredProgressionPayload = useMemo(() => {
    if (!hideAnonymized || !progressionPayload?.series) return progressionPayload;
    const series = Object.fromEntries(
      Object.entries(progressionPayload.series).filter(([name]) => isVisibleAccount(name))
    );
    return { ...progressionPayload, series };
  }, [progressionPayload, hideAnonymized]);

  const filteredComparePayload = useMemo(() => {
    if (!hideAnonymized || !comparePayload?.series) return comparePayload;
    const series = Object.fromEntries(
      Object.entries(comparePayload.series).filter(([name]) => isVisibleAccount(name))
    );
    const accounts = (comparePayload.accounts || []).filter((a) => isVisibleAccount(a));
    return { ...comparePayload, accounts, series };
  }, [comparePayload, hideAnonymized]);

  const filteredDeltaRows = useMemo(() => {
    const rows = deltaPayload?.rows || [];
    return rows.filter((r) => isVisibleAccount(r.accountName));
  }, [deltaPayload, hideAnonymized]);

  const filteredAnomalies = useMemo(() => {
    const rows = anomaliesPayload?.anomalies || [];
    return rows.filter((r) => isVisibleAccount(r.accountName));
  }, [anomaliesPayload, hideAnonymized]);

  const filteredResetImpactRows = useMemo(() => {
    const rows = resetImpactPayload?.rows || [];
    return rows.filter((r) => isVisibleAccount(r.accountName));
  }, [resetImpactPayload, hideAnonymized]);

  const filteredConsistencyRows = useMemo(() => {
    const rows = consistencyPayload?.rows || [];
    return rows.filter((r) => isVisibleAccount(r.accountName));
  }, [consistencyPayload, hideAnonymized]);

  const filteredWatchlistRows = useMemo(() => {
    const rows = watchlistPayload?.rows || [];
    return rows.filter((r) => isVisibleAccount(r.accountName || r.requestedAccount));
  }, [watchlistPayload, hideAnonymized]);

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

  const leaderboardTotalRows = leaderboardSort.sorted.length;
  const leaderboardTotalPages = Math.max(1, Math.ceil(leaderboardTotalRows / leaderboardPageSize));
  const clampedLeaderboardPage = Math.min(leaderboardPage, leaderboardTotalPages);
  const leaderboardVisibleRows = useMemo(() => {
    const start = (clampedLeaderboardPage - 1) * leaderboardPageSize;
    return leaderboardSort.sorted.slice(start, start + leaderboardPageSize);
  }, [leaderboardSort.sorted, clampedLeaderboardPage, leaderboardPageSize]);
  const leaderboardStartIndex = leaderboardTotalRows ? (clampedLeaderboardPage - 1) * leaderboardPageSize + 1 : 0;
  const leaderboardEndIndex = leaderboardTotalRows
    ? Math.min(clampedLeaderboardPage * leaderboardPageSize, leaderboardTotalRows)
    : 0;

  const moversTotalRows = deltaSort.sorted.length;
  const moversTotalPages = Math.max(1, Math.ceil(moversTotalRows / moversPageSize));
  const clampedMoversPage = Math.min(moversPage, moversTotalPages);
  const moversVisibleRows = useMemo(() => {
    const start = (clampedMoversPage - 1) * moversPageSize;
    return deltaSort.sorted.slice(start, start + moversPageSize);
  }, [deltaSort.sorted, clampedMoversPage, moversPageSize]);
  const moversStartIndex = moversTotalRows ? (clampedMoversPage - 1) * moversPageSize + 1 : 0;
  const moversEndIndex = moversTotalRows ? Math.min(clampedMoversPage * moversPageSize, moversTotalRows) : 0;

  const anomaliesTotalRows = anomalySort.sorted.length;
  const anomaliesTotalPages = Math.max(1, Math.ceil(anomaliesTotalRows / anomaliesPageSize));
  const clampedAnomaliesPage = Math.min(anomaliesPage, anomaliesTotalPages);
  const anomaliesVisibleRows = useMemo(() => {
    const start = (clampedAnomaliesPage - 1) * anomaliesPageSize;
    return anomalySort.sorted.slice(start, start + anomaliesPageSize);
  }, [anomalySort.sorted, clampedAnomaliesPage, anomaliesPageSize]);
  const anomaliesStartIndex = anomaliesTotalRows ? (clampedAnomaliesPage - 1) * anomaliesPageSize + 1 : 0;
  const anomaliesEndIndex = anomaliesTotalRows
    ? Math.min(clampedAnomaliesPage * anomaliesPageSize, anomaliesTotalRows)
    : 0;

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
    },
  });

  /* ── CSV exports ── */
  function exportLeaderboardCsv() {
    const headers = [
      { key: "rank", label: "Rank" },
      { key: "accountName", label: "Account" },
      { key: "weeklyKills", label: "WeeklyKills" },
      { key: "totalKills", label: "TotalKills" },
    ];
    downloadCsv(`vox-leaderboard-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`, headers, filteredEntries);
    addToast({ title: "Export", description: "Leaderboard CSV downloaded.", variant: "success", duration: 3000 });
  }

  function exportDeltaCsv() {
    const headers = [
      { key: "latestRank", label: "LatestRank" },
      { key: "previousRank", label: "PreviousRank" },
      { key: "rankChange", label: "RankChange" },
      { key: "accountName", label: "Account" },
      { key: "weeklyKillsDelta", label: "WeeklyDelta" },
    ];
    if (showTotalDelta) headers.push({ key: "totalKillsDelta", label: "TotalDelta" });
    downloadCsv(
      `vox-delta-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      headers,
      filteredDeltaRows
    );
    addToast({ title: "Export", description: "Delta CSV downloaded.", variant: "success", duration: 3000 });
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
            setLeaderboardPageSize={setLeaderboardPageSize}
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
            leaderboardStartIndex={leaderboardStartIndex}
            leaderboardEndIndex={leaderboardEndIndex}
            leaderboardTotalRows={leaderboardTotalRows}
            clampedLeaderboardPage={clampedLeaderboardPage}
            leaderboardTotalPages={leaderboardTotalPages}
            onPrevPage={() => setLeaderboardPage((p) => Math.max(1, p - 1))}
            onNextPage={() => setLeaderboardPage((p) => Math.min(leaderboardTotalPages, p + 1))}
            healthPayload={healthPayload}
            initialLoading={initialLoading}
            leaderboardSort={leaderboardSort}
            leaderboardVisibleRows={leaderboardVisibleRows}
          />

          <Suspense fallback={<SectionFallback />}>
            <RankMoversSection
              deltaMetric={deltaMetric}
              setDeltaMetric={setDeltaMetric}
              showTotalDelta={showTotalDelta}
              setShowTotalDelta={setShowTotalDelta}
              moversPageSize={moversPageSize}
              setMoversPageSize={setMoversPageSize}
              topDelta={topDelta}
              setTopDelta={setTopDelta}
              exportDeltaCsv={exportDeltaCsv}
              scope={scope}
              deltaPayload={deltaPayload}
              timeZone={timeZone}
              movers={movers}
              moversStartIndex={moversStartIndex}
              moversEndIndex={moversEndIndex}
              moversTotalRows={moversTotalRows}
              clampedMoversPage={clampedMoversPage}
              moversTotalPages={moversTotalPages}
              onPrevPage={() => setMoversPage((p) => Math.max(1, p - 1))}
              onNextPage={() => setMoversPage((p) => Math.min(moversTotalPages, p + 1))}
              deltaSort={deltaSort}
              moversVisibleRows={moversVisibleRows}
            />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <AnomaliesSection
              anomalyMinDelta={anomalyMinDelta}
              setAnomalyMinDelta={setAnomalyMinDelta}
              anomaliesPageSize={anomaliesPageSize}
              setAnomaliesPageSize={setAnomaliesPageSize}
              exportAnomaliesCsv={exportAnomaliesCsv}
              anomalySort={anomalySort}
              timeZone={timeZone}
              anomaliesStartIndex={anomaliesStartIndex}
              anomaliesEndIndex={anomaliesEndIndex}
              anomaliesTotalRows={anomaliesTotalRows}
              clampedAnomaliesPage={clampedAnomaliesPage}
              anomaliesTotalPages={anomaliesTotalPages}
              onPrevPage={() => setAnomaliesPage((p) => Math.max(1, p - 1))}
              onNextPage={() => setAnomaliesPage((p) => Math.min(anomaliesTotalPages, p + 1))}
              anomaliesVisibleRows={anomaliesVisibleRows}
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









