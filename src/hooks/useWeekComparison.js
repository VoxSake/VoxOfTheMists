import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { fmtNumber } from "../utils";
import { usePersistedState } from "./usePersistedState";

const CURRENT_WEEK_ID = "__current_week__";

export function useWeekComparison(weekOptions) {
  const [compareWeekA, setCompareWeekA] = usePersistedState("vox-compare-week-a", "", {
    parse: (raw) => String(raw || "").trim(),
    serialize: (v) => String(v || ""),
  });
  const [compareWeekB, setCompareWeekB] = usePersistedState("vox-compare-week-b", "", {
    parse: (raw) => String(raw || "").trim(),
    serialize: (v) => String(v || ""),
  });
  const [weekCompareState, setWeekCompareState] = useState({
    loading: false,
    error: null,
    reportA: null,
    reportB: null,
  });

  const compareWeekOptions = useMemo(
    () => [{ weekEndUtc: CURRENT_WEEK_ID, label: "Current Week (Live)" }, ...(weekOptions || [])],
    [weekOptions]
  );

  useEffect(() => {
    const ids = compareWeekOptions.map((w) => w.weekEndUtc);
    if (!ids.length) return;
    if (!compareWeekA || !ids.includes(compareWeekA)) setCompareWeekA(ids[0]);
    if (!compareWeekB || !ids.includes(compareWeekB)) setCompareWeekB(ids[Math.min(1, ids.length - 1)]);
  }, [compareWeekOptions, compareWeekA, compareWeekB, setCompareWeekA, setCompareWeekB]);

  useEffect(() => {
    if (!compareWeekA || !compareWeekB) return;
    let cancelled = false;
    setWeekCompareState((prev) => ({ ...prev, loading: true, error: null }));
    const toReportPromise = (weekId) =>
      weekId === CURRENT_WEEK_ID ? api.getWeeklyReport({}) : api.getWeeklyReport({ weekEnd: weekId });
    Promise.all([toReportPromise(compareWeekA), toReportPromise(compareWeekB)])
      .then(([reportA, reportB]) => {
        if (cancelled) return;
        setWeekCompareState({ loading: false, error: null, reportA, reportB });
      })
      .catch((err) => {
        if (cancelled) return;
        setWeekCompareState({ loading: false, error: err?.message || "unknown_error", reportA: null, reportB: null });
      });
    return () => {
      cancelled = true;
    };
  }, [compareWeekA, compareWeekB]);

  const weekOptionById = useMemo(
    () => new Map((compareWeekOptions || []).map((w) => [String(w.weekEndUtc || ""), w])),
    [compareWeekOptions]
  );

  const weekCompareSummary = useMemo(() => {
    const summarize = (report, weekId) => {
      if (!report) return null;
      const deltaRows = Array.isArray(report?.delta?.rows) ? report.delta.rows : [];
      const anomalies = Array.isArray(report?.anomalies?.anomalies) ? report.anomalies.anomalies : [];
      const progressionSeries = report?.progression?.series || {};
      const trackedAccounts = Object.keys(progressionSeries).length;
      const totalDelta = deltaRows.reduce((sum, row) => sum + Number(row?.weeklyKillsDelta || 0), 0);
      const topMoverRow = [...deltaRows].sort((a, b) => Number(b?.weeklyKillsDelta || 0) - Number(a?.weeklyKillsDelta || 0))[0];
      const topMover = topMoverRow ? `${topMoverRow.accountName} (+${fmtNumber(topMoverRow.weeklyKillsDelta)})` : "-";
      return {
        label: weekOptionById.get(String(weekId || ""))?.label || String(weekId || "-"),
        totalDelta,
        anomaliesCount: anomalies.length,
        trackedAccounts,
        topMover,
      };
    };

    const summaryA = summarize(weekCompareState.reportA, compareWeekA);
    const summaryB = summarize(weekCompareState.reportB, compareWeekB);
    const comparisonRows =
      summaryA && summaryB
        ? [
            {
              metric: "Total Weekly Delta (Top Movers scope)",
              a: fmtNumber(summaryA.totalDelta),
              b: fmtNumber(summaryB.totalDelta),
              diff: `${summaryB.totalDelta - summaryA.totalDelta > 0 ? "+" : ""}${fmtNumber(summaryB.totalDelta - summaryA.totalDelta)}`,
            },
            {
              metric: "Anomalies Detected",
              a: fmtNumber(summaryA.anomaliesCount),
              b: fmtNumber(summaryB.anomaliesCount),
              diff: `${summaryB.anomaliesCount - summaryA.anomaliesCount > 0 ? "+" : ""}${fmtNumber(
                summaryB.anomaliesCount - summaryA.anomaliesCount
              )}`,
            },
            {
              metric: "Tracked Accounts (Progression)",
              a: fmtNumber(summaryA.trackedAccounts),
              b: fmtNumber(summaryB.trackedAccounts),
              diff: `${summaryB.trackedAccounts - summaryA.trackedAccounts > 0 ? "+" : ""}${fmtNumber(
                summaryB.trackedAccounts - summaryA.trackedAccounts
              )}`,
            },
          ]
        : [];

    return { summaryA, summaryB, comparisonRows };
  }, [weekCompareState, compareWeekA, compareWeekB, weekOptionById]);

  return {
    compareWeekA,
    compareWeekB,
    setCompareWeekA,
    setCompareWeekB,
    compareWeekOptions,
    weekCompareState,
    weekCompareSummary,
  };
}
