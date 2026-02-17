let writeAuthToken = null;

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
  getLatest(top) {
    return requestJson(`/api/latest?top=${top}`);
  },
  getSnapshots() {
    return requestJson("/api/snapshots");
  },
  getProgressionTop({ top, scope, days = null }) {
    const daysQuery = days ? `&days=${days}` : "";
    return requestJson(`/api/progression/top?top=${top}&scope=${encodeURIComponent(scope)}${daysQuery}`);
  },
  getCompare({ accounts, scope, days = null }) {
    const daysQuery = days ? `&days=${days}` : "";
    return requestJson(
      `/api/compare?accounts=${encodeURIComponent(accounts.join(","))}&scope=${encodeURIComponent(scope)}${daysQuery}`
    );
  },
  getLeaderboardDelta({ top, metric, scope }) {
    return requestJson(
      `/api/leaderboard/delta?top=${top}&metric=${encodeURIComponent(metric)}&scope=${encodeURIComponent(scope)}`
    );
  },
  getAnomalies({ top, minDeltaAbs, lookbackHours, scope }) {
    return requestJson(
      `/api/anomalies?top=${top}&minDeltaAbs=${minDeltaAbs}&lookbackHours=${lookbackHours}&scope=${encodeURIComponent(scope)}`
    );
  },
  getResetImpact({ top, windowHours }) {
    return requestJson(`/api/reset-impact?top=${top}&windowHours=${windowHours}`);
  },
  getConsistency({ top, scope, days = null }) {
    const daysQuery = days ? `&days=${days}` : "";
    return requestJson(`/api/consistency?top=${top}&scope=${encodeURIComponent(scope)}${daysQuery}`);
  },
  getWatchlist({ accounts, minGain, minRankUp, scope }) {
    return requestJson(
      `/api/watchlist?accounts=${encodeURIComponent(accounts.join(","))}&minGain=${minGain}&minRankUp=${minRankUp}&scope=${encodeURIComponent(scope)}`
    );
  },
  getHealth() {
    return requestJson("/api/health");
  },
  getWeeklyReport() {
    return requestJson("/api/report/weekly");
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
