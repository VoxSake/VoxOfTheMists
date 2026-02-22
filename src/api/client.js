let writeAuthToken = null;

function buildWeekEndQuery(weekEnd) {
  return weekEnd ? `&weekEnd=${encodeURIComponent(weekEnd)}` : "";
}

async function requestJson(url, init = {}) {
  const res = await fetch(url, init);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
  return payload;
}

async function ensureWriteAuthToken(forceRefresh = false) {
  if (!forceRefresh && writeAuthToken) return writeAuthToken;
  const payload = await requestJson("/api/write-auth");
  const token = String(payload?.token || "").trim();
  if (!token) throw new Error("Write authorization unavailable");
  writeAuthToken = token;
  return token;
}

async function postWithWriteAuth(url, body = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await ensureWriteAuthToken(attempt > 0);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": token,
      },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) return payload;
    if (res.status === 403 && attempt === 0) {
      writeAuthToken = null;
      continue;
    }
    throw new Error(payload?.error || `HTTP ${res.status}`);
  }
  throw new Error("Write authorization unavailable");
}

export const api = {
  getLatest({ top, weekEnd = null }) {
    const weekEndQuery = weekEnd ? `&weekEnd=${encodeURIComponent(weekEnd)}` : "";
    return requestJson(`/api/latest?top=${top}${weekEndQuery}`);
  },
  getSnapshots() {
    return requestJson("/api/snapshots");
  },
  getProgressionTop({ top, scope, days = null, weekEnd = null }) {
    const daysQuery = days ? `&days=${days}` : "";
    const weekEndQuery = buildWeekEndQuery(weekEnd);
    return requestJson(`/api/progression/top?top=${top}&scope=${encodeURIComponent(scope)}${daysQuery}${weekEndQuery}`);
  },
  getCompare({ accounts, scope, days = null, weekEnd = null }) {
    const daysQuery = days ? `&days=${days}` : "";
    const weekEndQuery = buildWeekEndQuery(weekEnd);
    return requestJson(
      `/api/compare?accounts=${encodeURIComponent(accounts.join(","))}&scope=${encodeURIComponent(scope)}${daysQuery}${weekEndQuery}`
    );
  },
  getPlayerHistory(account) {
    return requestJson(`/api/player/${encodeURIComponent(account)}/history`);
  },
  getLeaderboardDelta({ top, metric, scope, weekEnd = null }) {
    const weekEndQuery = buildWeekEndQuery(weekEnd);
    return requestJson(
      `/api/leaderboard/delta?top=${top}&metric=${encodeURIComponent(metric)}&scope=${encodeURIComponent(scope)}${weekEndQuery}`
    );
  },
  getAnomalies({ top, minDeltaAbs, lookbackHours, scope, weekEnd = null }) {
    const weekEndQuery = buildWeekEndQuery(weekEnd);
    return requestJson(
      `/api/anomalies?top=${top}&minDeltaAbs=${minDeltaAbs}&lookbackHours=${lookbackHours}&scope=${encodeURIComponent(scope)}${weekEndQuery}`
    );
  },
  getResetImpact({ top, windowHours, weekEnd = null }) {
    const weekEndQuery = buildWeekEndQuery(weekEnd);
    return requestJson(`/api/reset-impact?top=${top}&windowHours=${windowHours}${weekEndQuery}`);
  },
  getConsistency({ top, scope, days = null, weekEnd = null }) {
    const daysQuery = days ? `&days=${days}` : "";
    const weekEndQuery = buildWeekEndQuery(weekEnd);
    return requestJson(`/api/consistency?top=${top}&scope=${encodeURIComponent(scope)}${daysQuery}${weekEndQuery}`);
  },
  getWatchlist({ accounts, minGain, minRankUp, scope, weekEnd = null }) {
    const weekEndQuery = buildWeekEndQuery(weekEnd);
    return requestJson(
      `/api/watchlist?accounts=${encodeURIComponent(accounts.join(","))}&minGain=${minGain}&minRankUp=${minRankUp}&scope=${encodeURIComponent(scope)}${weekEndQuery}`
    );
  },
  getHealth() {
    return requestJson("/api/health");
  },
  getWeeklyReport({ weekEnd = null } = {}) {
    const weekEndQuery = weekEnd ? `?weekEnd=${encodeURIComponent(weekEnd)}` : "";
    return requestJson(`/api/report/weekly${weekEndQuery}`);
  },
  getWeeks() {
    return requestJson("/api/weeks");
  },
  getSnapshotStatus() {
    return requestJson("/api/snapshot/status");
  },
  searchAccounts({ query, limit = 12, signal } = {}) {
    return requestJson(`/api/accounts?query=${encodeURIComponent(query || "")}&limit=${limit}`, { signal });
  },
  runManualSnapshot() {
    return postWithWriteAuth("/api/snapshot/run", {});
  },
  runManualAppwriteSync() {
    return postWithWriteAuth("/api/sync/run", {});
  },
  runGuildSearch({ query, region = "eu", maxPages = 20, perPage = 100 }) {
    return postWithWriteAuth("/api/guild-search/run", {
      query,
      region,
      maxPages,
      perPage,
    });
  },
  getGuildSearchJob({ jobId, page = 1, pageSize = 50 }) {
    return requestJson(`/api/guild-search/${encodeURIComponent(jobId)}?page=${page}&pageSize=${pageSize}`);
  },
  shareSnapshotToDiscord({ webhookUrl, filename, html, content = "" }) {
    return postWithWriteAuth("/api/share/discord", {
      webhookUrl,
      filename,
      html,
      content,
    });
  },
  testDiscordWebhook(webhookUrl) {
    return postWithWriteAuth("/api/share/discord/test", { webhookUrl });
  },
};
