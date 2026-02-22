function createAppwriteSyncService({
  appwriteSdk,
  config,
  deps,
}) {
  const {
    enabled,
    endpoint,
    projectId,
    apiKey,
    databaseId,
    snapshotsCollectionId,
    entriesCollectionId,
    syncIntervalMinutes,
    syncHourlyAligned,
    syncTargetMinute,
    syncEntryBatchSize,
    syncStartupMinStaleMinutes,
    backfillEnabled,
    backfillTargetMinute,
    functionId,
  } = config;

  const {
    qLatestSnapshot,
    qSnapshotExists,
    importSnapshotIntoLocalDb,
    sanitizeAccountName,
    normalizeOptionalText,
    chunkArray,
    log,
    onImported,
  } = deps;

  let appwriteDatabasesClient = null;
  let appwriteSyncInProgress = false;
  let appwriteSyncTimer = null;
  let appwriteBackfillTimer = null;
  let nextAppwriteSyncAtIso = null;
  const appwriteBase = endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`;
  const syncFailureBackoffBaseMs = 60 * 1000;
  const syncFailureBackoffMaxMs = 15 * 60 * 1000;

  const status = {
    enabled,
    running: false,
    lastTrigger: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
    lastFetchedSnapshots: 0,
    lastImportedSnapshots: 0,
    lastImportedEntries: 0,
    consecutiveFailures: 0,
    lastSuccessfulAt: null,
  };

  function getSyncFailureBackoffMs() {
    const failures = Math.max(1, Number(status.consecutiveFailures || 1));
    const multiplier = 2 ** Math.max(0, failures - 1);
    return Math.min(syncFailureBackoffMaxMs, syncFailureBackoffBaseMs * multiplier);
  }

  function getConfigError() {
    if (!enabled) return null;
    const required = [
      ["APPWRITE_ENDPOINT", endpoint],
      ["APPWRITE_PROJECT_ID", projectId],
      ["APPWRITE_API_KEY", apiKey],
      ["APPWRITE_DATABASE_ID", databaseId],
      ["APPWRITE_SNAPSHOTS_COLLECTION_ID", snapshotsCollectionId],
      ["APPWRITE_ENTRIES_COLLECTION_ID", entriesCollectionId],
    ];
    const missing = required.filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) return `Missing Appwrite env vars: ${missing.join(", ")}`;
    return null;
  }

  function getBackfillConfigError() {
    if (!enabled || !backfillEnabled) return null;
    if (!functionId) return "Missing Appwrite env var: APPWRITE_FUNCTION_ID";
    return null;
  }

  function getAppwriteDatabasesClient() {
    if (appwriteDatabasesClient) return appwriteDatabasesClient;
    const client = new appwriteSdk.Client()
      .setEndpoint(appwriteBase)
      .setProject(projectId)
      .setKey(apiKey);
    appwriteDatabasesClient = new appwriteSdk.Databases(client);
    return appwriteDatabasesClient;
  }

  async function appwriteListAllDocuments(
    collectionId,
    { orderBy = "$createdAt", greaterThanCreatedAt = null, extraQueries = [] } = {}
  ) {
    const databases = getAppwriteDatabasesClient();
    const out = [];
    const pageSize = 100;
    let cursorAfter = null;
    let loopGuard = 0;
    while (loopGuard < 2000) {
      loopGuard += 1;
      const queries = [appwriteSdk.Query.limit(pageSize)];
      if (orderBy) queries.push(appwriteSdk.Query.orderAsc(orderBy));
      if (greaterThanCreatedAt) queries.push(appwriteSdk.Query.greaterThan("createdAt", greaterThanCreatedAt));
      if (Array.isArray(extraQueries) && extraQueries.length) queries.push(...extraQueries);
      if (cursorAfter) queries.push(appwriteSdk.Query.cursorAfter(cursorAfter));

      const page = await databases.listDocuments(databaseId, collectionId, queries);
      const docs = Array.isArray(page?.documents) ? page.documents : [];
      if (!docs.length) break;
      out.push(...docs);
      if (docs.length < pageSize) break;
      cursorAfter = docs[docs.length - 1].$id;
    }
    if (loopGuard >= 2000) throw new Error("Appwrite pagination guard exceeded");
    return out;
  }

  async function appwriteListEntriesBySnapshotIds(snapshotIds) {
    const bySnapshot = new Map(snapshotIds.map((id) => [id, []]));
    if (!snapshotIds.length) return bySnapshot;
    const idChunks = chunkArray(snapshotIds, syncEntryBatchSize);
    for (const ids of idChunks) {
      const docs = await appwriteListAllDocuments(entriesCollectionId, {
        orderBy: "$createdAt",
        extraQueries: [appwriteSdk.Query.equal("snapshotId", ids)],
      });
      for (const doc of docs) {
        const snapshotId = String(doc?.snapshotId || doc?.snapshot_id || "").trim();
        if (!snapshotId || !bySnapshot.has(snapshotId)) continue;
        bySnapshot.get(snapshotId).push(doc);
      }
    }
    return bySnapshot;
  }

  function mapAppwriteSnapshotDocument(doc) {
    const snapshotId = String(doc?.snapshotId || doc?.snapshot_id || doc?.$id || "").trim();
    const createdAt = String(doc?.createdAt || doc?.created_at || "").trim();
    if (!snapshotId || !createdAt) return null;
    return {
      snapshotId,
      createdAt,
      source: String(doc?.source || "appwrite").trim() || "appwrite",
      region: String(doc?.region || "eu").trim() || "eu",
      pages: Number(doc?.pages || 3) || 3,
      perPage: Number(doc?.perPage || doc?.per_page || 100) || 100,
      totalAvailable: Number(doc?.totalAvailable || doc?.total_available || 0) || 0,
      count: Number(doc?.count || 0) || 0,
    };
  }

  function mapAppwriteEntryDocument(doc) {
    const rank = Number(doc?.rank);
    const accountName = sanitizeAccountName(doc?.accountName || doc?.account_name || "");
    if (!Number.isFinite(rank) || rank <= 0 || !accountName) return null;
    return {
      rank: Math.floor(rank),
      accountName,
      weeklyKills: Number(doc?.weeklyKills || doc?.weekly_kills || 0) || 0,
      totalKills: Number(doc?.totalKills || doc?.total_kills || 0) || 0,
      wvwGuildName: normalizeOptionalText(
        doc?.wvwGuildName || doc?.wvw_guild_name || doc?.allianceName || doc?.alliance_name || doc?.selectedGuildName
      ),
      wvwGuildTag: normalizeOptionalText(
        doc?.wvwGuildTag || doc?.wvw_guild_tag || doc?.allianceTag || doc?.alliance_tag || doc?.selectedGuildTag
      ),
      allianceGuildName: normalizeOptionalText(
        doc?.allianceGuildName || doc?.alliance_guild_name || doc?.guildName || doc?.guild_name
      ),
      allianceGuildTag: normalizeOptionalText(
        doc?.allianceGuildTag || doc?.alliance_guild_tag || doc?.guildTag || doc?.guild_tag
      ),
    };
  }

  async function runSyncAsync(trigger) {
    if (!enabled) return { skipped: true, reason: "disabled" };
    if (appwriteSyncInProgress) return { skipped: true, reason: "in_progress" };

    const configError = getConfigError();
    if (configError) {
      status.lastError = configError;
      throw new Error(configError);
    }

    appwriteSyncInProgress = true;
    status.running = true;
    status.lastTrigger = trigger;
    status.lastStartedAt = new Date().toISOString();
    status.lastError = null;

    try {
      const latestLocal = qLatestSnapshot.get();
      const latestLocalCreatedAt = latestLocal?.created_at || null;
      const snapshotDocs = await appwriteListAllDocuments(snapshotsCollectionId, {
        orderBy: "createdAt",
        greaterThanCreatedAt: latestLocalCreatedAt,
      });
      status.lastFetchedSnapshots = snapshotDocs.length;

      const pendingSnapshots = snapshotDocs
        .map(mapAppwriteSnapshotDocument)
        .filter(Boolean)
        .filter((snapshot) => !qSnapshotExists.get(snapshot.snapshotId));
      const pendingSnapshotIds = pendingSnapshots.map((s) => s.snapshotId);
      const entryDocsBySnapshotId = await appwriteListEntriesBySnapshotIds(pendingSnapshotIds);

      let importedSnapshots = 0;
      let importedEntries = 0;
      for (const snapshot of pendingSnapshots) {
        const entryDocs = entryDocsBySnapshotId.get(snapshot.snapshotId) || [];
        const entries = entryDocs
          .map(mapAppwriteEntryDocument)
          .filter(Boolean)
          .sort((a, b) => a.rank - b.rank);
        const expectedCount = Math.max(0, Number(snapshot.count || 0));
        const minAccepted = expectedCount > 0 ? Math.max(20, Math.floor(expectedCount * 0.9)) : 1;
        if (entries.length < minAccepted) {
          log.warn(
            `[appwrite-sync] Skip snapshot ${snapshot.snapshotId}: entries=${entries.length}, expected=${expectedCount}`
          );
          continue;
        }
        importSnapshotIntoLocalDb(snapshot, entries);
        importedSnapshots += 1;
        importedEntries += entries.length;
      }

      status.lastImportedSnapshots = importedSnapshots;
      status.lastImportedEntries = importedEntries;
      status.lastFinishedAt = new Date().toISOString();
      status.lastSuccessfulAt = status.lastFinishedAt;
      status.consecutiveFailures = 0;
      status.lastError = null;

      if (importedSnapshots > 0 && typeof onImported === "function") {
        onImported();
      }
      return { ok: true, fetched: snapshotDocs.length, importedSnapshots, importedEntries };
    } catch (err) {
      status.consecutiveFailures = Number(status.consecutiveFailures || 0) + 1;
      status.lastError = err.message;
      status.lastFinishedAt = new Date().toISOString();
      throw err;
    } finally {
      status.running = false;
      appwriteSyncInProgress = false;
    }
  }

  function currentUtcHourSnapshotInfo() {
    const now = new Date();
    const hourUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0)
    );
    const createdAt = hourUtc.toISOString().replace(".000Z", "+00:00");
    return {
      snapshotId: createdAt.replace(/:/g, "-"),
      createdAt,
    };
  }

  async function triggerAppwriteFunctionExecution() {
    const callEndpoint = `${appwriteBase}/functions/${encodeURIComponent(functionId)}/executions`;
    const res = await fetch(callEndpoint, {
      method: "POST",
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ async: false }),
    });
    const text = await res.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!res.ok) {
      const msg = payload?.message || payload?.raw || `HTTP ${res.status}`;
      throw new Error(`Appwrite function trigger failed: ${msg}`);
    }
    return payload;
  }

  async function runBackfillGuard(trigger) {
    if (!enabled || !backfillEnabled) return { skipped: true, reason: "disabled" };
    const configError = getBackfillConfigError();
    if (configError) {
      status.lastError = configError;
      throw new Error(configError);
    }

    const expected = currentUtcHourSnapshotInfo();
    const databases = getAppwriteDatabasesClient();
    const page = await databases.listDocuments(databaseId, snapshotsCollectionId, [
      appwriteSdk.Query.equal("snapshotId", [expected.snapshotId]),
      appwriteSdk.Query.limit(1),
    ]);
    if ((page?.documents || []).length > 0) {
      return { skipped: true, reason: "snapshot_exists", expectedSnapshotId: expected.snapshotId };
    }

    log.warn(
      `[appwrite-backfill] Missing snapshot ${expected.snapshotId}. Triggering function ${functionId} (${trigger}).`
    );
    const execution = await triggerAppwriteFunctionExecution();
    let syncResult = null;
    try {
      syncResult = await runSyncAsync("backfill-guard");
    } catch (err) {
      log.warn(`[appwrite-backfill] Triggered function but sync failed: ${err.message}`);
    }
    return {
      ok: true,
      triggered: true,
      expectedSnapshotId: expected.snapshotId,
      executionId: execution?.$id || null,
      syncResult,
    };
  }

  function scheduleSync(delayMs = null) {
    if (!enabled) return;
    const hasExplicitDelay = typeof delayMs === "number" && Number.isFinite(delayMs);
    let delay = hasExplicitDelay ? Math.max(250, delayMs) : syncIntervalMinutes * 60 * 1000;
    if (!hasExplicitDelay && syncHourlyAligned) {
      const now = new Date();
      const next = new Date(now);
      next.setUTCSeconds(0, 0);
      next.setUTCMinutes(syncTargetMinute);
      if (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 1);
      delay = Math.max(250, next.getTime() - now.getTime());
    }
    nextAppwriteSyncAtIso = new Date(Date.now() + delay).toISOString();
    clearTimeout(appwriteSyncTimer);
    appwriteSyncTimer = setTimeout(async () => {
      let nextDelayOverrideMs = null;
      try {
        await runSyncAsync("timer");
      } catch (err) {
        nextDelayOverrideMs = getSyncFailureBackoffMs();
        log.error(
          `[appwrite-sync] Failed: ${err.message} (consecutiveFailures=${status.consecutiveFailures}, retryInMs=${nextDelayOverrideMs})`
        );
      } finally {
        scheduleSync(nextDelayOverrideMs);
      }
    }, delay);
  }

  function millisecondsToNextUtcMinute(targetMinute) {
    const now = new Date();
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMinutes(targetMinute);
    if (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 1);
    return next.getTime() - now.getTime();
  }

  function scheduleBackfill(delayMs = null) {
    if (!enabled || !backfillEnabled) return;
    const cfgErr = getBackfillConfigError();
    if (cfgErr) {
      log.error(`[appwrite-backfill] ${cfgErr}`);
      return;
    }
    const hasExplicitDelay = typeof delayMs === "number" && Number.isFinite(delayMs);
    const delay = hasExplicitDelay
      ? Math.max(250, delayMs)
      : Math.max(250, millisecondsToNextUtcMinute(backfillTargetMinute));
    clearTimeout(appwriteBackfillTimer);
    appwriteBackfillTimer = setTimeout(async () => {
      try {
        const result = await runBackfillGuard("timer");
        if (!result?.skipped) {
          log.info(
            `[appwrite-backfill] Triggered executionId=${result.executionId || "-"} expectedSnapshot=${result.expectedSnapshotId}`
          );
        }
      } catch (err) {
        log.error(`[appwrite-backfill] Failed: ${err.message}`);
      } finally {
        scheduleBackfill();
      }
    }, delay);
  }

  function shouldRunStartupSync() {
    if (!enabled) return false;
    if (syncStartupMinStaleMinutes <= 0) return true;
    const latest = qLatestSnapshot.get();
    const latestCreatedAt = String(latest?.created_at || "").trim();
    if (!latestCreatedAt) return true;

    const latestMs = Date.parse(latestCreatedAt);
    if (!Number.isFinite(latestMs)) return true;
    const staleMs = syncStartupMinStaleMinutes * 60 * 1000;
    return Date.now() - latestMs >= staleMs;
  }

  function stop() {
    clearTimeout(appwriteSyncTimer);
    clearTimeout(appwriteBackfillTimer);
    appwriteSyncTimer = null;
    appwriteBackfillTimer = null;
    nextAppwriteSyncAtIso = null;
  }

  function getStatus() {
    return status;
  }

  function getNextSyncAtIso() {
    return nextAppwriteSyncAtIso;
  }

  return {
    getConfigError,
    runSyncAsync,
    scheduleSync,
    scheduleBackfill,
    shouldRunStartupSync,
    getStatus,
    getNextSyncAtIso,
    stop,
  };
}

module.exports = {
  createAppwriteSyncService,
};
