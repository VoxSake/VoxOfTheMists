import { formatTimestamp } from "../utils";

export const LEADERBOARD_CSV_HEADERS = [
  { key: "rank", label: "Rank" },
  { key: "accountName", label: "Account" },
  { key: "wvwGuildName", label: "WvWGuildName" },
  { key: "wvwGuildTag", label: "WvWGuildTag" },
  { key: "allianceGuildName", label: "AllianceGuildName" },
  { key: "allianceGuildTag", label: "AllianceGuildTag" },
  { key: "weeklyKills", label: "WeeklyKills" },
  { key: "totalKills", label: "TotalKills" },
];

export const DELTA_CSV_BASE_HEADERS = [
  { key: "latestRank", label: "LatestRank" },
  { key: "previousRank", label: "PreviousRank" },
  { key: "rankChange", label: "RankChange" },
  { key: "accountName", label: "Account" },
  { key: "weeklyKillsDelta", label: "WeeklyDelta" },
];

export const ANOMALIES_CSV_HEADERS = [
  { key: "createdAt", label: "Time" },
  { key: "accountName", label: "Account" },
  { key: "direction", label: "Type" },
  { key: "latestDelta", label: "LatestDelta" },
  { key: "baselineAvg", label: "Baseline" },
  { key: "deviation", label: "Deviation" },
  { key: "deviationPct", label: "DeviationPct" },
];

export function buildDeltaCsvHeaders(showTotalDelta) {
  if (!showTotalDelta) return DELTA_CSV_BASE_HEADERS;
  return [...DELTA_CSV_BASE_HEADERS, { key: "totalKillsDelta", label: "TotalDelta" }];
}

export function mapAnomalyRowsForCsv(rows, timeZone) {
  return (rows || []).map((row) => ({
    createdAt: formatTimestamp(row.createdAt, timeZone),
    accountName: row.accountName,
    direction: row.direction ? row.direction.charAt(0).toUpperCase() + row.direction.slice(1) : "-",
    latestDelta: row.latestDelta,
    baselineAvg: row.baselineAvg,
    deviation: row.deviation,
    deviationPct: row.deviationPct,
  }));
}
