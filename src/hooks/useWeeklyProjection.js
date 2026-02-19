import { useMemo } from "react";

export function useWeeklyProjection({
  scope,
  comparePayload,
  filteredComparePayload,
  metric,
  compareSummaries,
}) {
  const projection = useMemo(() => {
    if (scope !== "week") return null;
    if (!comparePayload?.weekWindow?.endUtc) return null;
    if (!filteredComparePayload?.series) return null;

    const endIso = comparePayload.weekWindow.endUtc;
    const endMs = Date.parse(endIso);
    if (!Number.isFinite(endMs)) return null;

    const projectedSeries = {};
    const projectionStartByAccount = {};
    const rows = [];

    for (const [account, points] of Object.entries(filteredComparePayload.series)) {
      const ordered = [...(points || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      if (!ordered.length) continue;

      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      const firstMs = Date.parse(first.createdAt);
      const lastMs = Date.parse(last.createdAt);
      const firstValue = Number(first?.[metric] || 0);
      const latestValue = Number(last?.[metric] || 0);

      if (
        !Number.isFinite(firstMs) ||
        !Number.isFinite(lastMs) ||
        !Number.isFinite(firstValue) ||
        !Number.isFinite(latestValue)
      ) {
        projectedSeries[account] = ordered;
        continue;
      }

      const elapsedHours = Math.max(0, (lastMs - firstMs) / 3600000);
      const avgPerHour = elapsedHours > 0 ? Math.max(0, (latestValue - firstValue) / elapsedHours) : 0;
      const remainingHours = Math.max(0, (endMs - lastMs) / 3600000);
      const projectedValue = latestValue + avgPerHour * remainingHours;
      let extended = ordered;
      if (last.createdAt !== endIso && endMs > lastMs) {
        const hourMs = 60 * 60 * 1000;
        const projectedPoints = [];
        let cursorMs = lastMs;
        while (cursorMs + hourMs < endMs) {
          cursorMs += hourMs;
          const hoursFromLast = (cursorMs - lastMs) / hourMs;
          projectedPoints.push({
            ...last,
            createdAt: new Date(cursorMs).toISOString(),
            [metric]: latestValue + avgPerHour * hoursFromLast,
          });
        }
        projectedPoints.push({ ...last, createdAt: endIso, [metric]: projectedValue });
        extended = [...ordered, ...projectedPoints];
      }
      projectedSeries[account] = extended;
      projectionStartByAccount[account] = last.createdAt;

      rows.push({
        account,
        avgPerHour,
        latestValue,
        projectedValue,
      });
    }

    if (!Object.keys(projectedSeries).length) return null;

    const sortedRows = [...rows].sort((a, b) => b.projectedValue - a.projectedValue);
    return {
      endIso,
      payload: { ...filteredComparePayload, series: projectedSeries, projectionStartByAccount },
      rows: sortedRows,
      leader: sortedRows[0] || null,
    };
  }, [scope, comparePayload, filteredComparePayload, metric]);

  const weeklyProjectionByAccount = useMemo(() => {
    if (!comparePayload?.weekWindow?.endUtc) return {};
    if (!filteredComparePayload?.series) return {};
    const endMs = Date.parse(comparePayload.weekWindow.endUtc);
    if (!Number.isFinite(endMs)) return {};

    const byAccount = {};
    for (const [account, points] of Object.entries(filteredComparePayload.series)) {
      const ordered = [...(points || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      if (ordered.length < 2) continue;
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      const firstMs = Date.parse(first.createdAt);
      const lastMs = Date.parse(last.createdAt);
      const firstWeekly = Number(first?.weeklyKills || 0);
      const lastWeekly = Number(last?.weeklyKills || 0);
      if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) continue;
      if (!Number.isFinite(firstWeekly) || !Number.isFinite(lastWeekly) || lastMs <= firstMs) continue;

      const elapsedHours = Math.max(0, (lastMs - firstMs) / 3600000);
      const weeklyGain = Math.max(0, lastWeekly - firstWeekly);
      const avgPerHour = elapsedHours > 0 ? weeklyGain / elapsedHours : 0;
      const remainingHours = Math.max(0, (endMs - lastMs) / 3600000);
      const projectedGain = avgPerHour * remainingHours;
      const projectedWeekly = lastWeekly + projectedGain;

      byAccount[account] = {
        elapsedHours,
        weeklyGain,
        avgPerHour,
        remainingHours,
        projectedGain,
        projectedWeekly,
        samplePoints: ordered.length,
      };
    }
    return byAccount;
  }, [comparePayload, filteredComparePayload]);

  const sortedCompareSummaries = useMemo(() => {
    return [...compareSummaries].sort((a, b) => {
      const aProjected = weeklyProjectionByAccount[a.account]?.projectedWeekly;
      const bProjected = weeklyProjectionByAccount[b.account]?.projectedWeekly;
      const aHas = Number.isFinite(aProjected);
      const bHas = Number.isFinite(bProjected);
      if (aHas && bHas) return bProjected - aProjected;
      if (aHas) return -1;
      if (bHas) return 1;
      return String(a.account || "").localeCompare(String(b.account || ""));
    });
  }, [compareSummaries, weeklyProjectionByAccount]);

  return { projection, weeklyProjectionByAccount, sortedCompareSummaries };
}
