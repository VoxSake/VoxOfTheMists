function registerAnalyticsRoutes(fastify, deps) {
  const {
    withApiCache,
    resolveWeekSelectionOrReply,
    getDeltaLeaderboard,
    getAnomalies,
    getResetImpact,
    getConsistencyScores,
    parseAccountsParam,
    getWatchlistAlerts,
    getTopProgression,
    qLatestSnapshot,
    qLatestEntries,
    getLatestSnapshotMetaInWindow,
    serializeEntryRow,
    sanitizeAccountName,
    qHistory,
    getCurrentWeekWindowBrussels,
    getCompareSeries,
    qAccountSearch,
  } = deps;

  fastify.get(
    "/api/leaderboard/delta",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            metric: { type: "string", enum: ["weeklyKills", "totalKills"], default: "weeklyKills" },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
            weekEnd: { type: "string", maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const top = request.query.top || 50;
      const metric = request.query.metric || "weeklyKills";
      const scope = request.query.scope || "week";
      const resolvedWeek = resolveWeekSelectionOrReply({
        reply,
        scope,
        weekEndRaw: request.query.weekEnd,
      });
      if (!resolvedWeek) return;
      return withApiCache(
        "delta",
        { top, metric, scope, weekEnd: resolvedWeek?.selectedWeekEndUtc || null },
        60_000,
        async () => getDeltaLeaderboard({ top, metric, scope, weekWindow: resolvedWeek?.weekWindow || null })
      );
    }
  );

  fastify.get(
    "/api/anomalies",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            minDeltaAbs: { type: "integer", minimum: 1, maximum: 5000, default: 80 },
            lookbackHours: { type: "integer", minimum: 12, maximum: 720, default: 72 },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
            weekEnd: { type: "string", maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const top = request.query.top || 20;
      const minDeltaAbs = request.query.minDeltaAbs || 80;
      const lookbackHours = request.query.lookbackHours || 72;
      const scope = request.query.scope || "week";
      const resolvedWeek = resolveWeekSelectionOrReply({
        reply,
        scope,
        weekEndRaw: request.query.weekEnd,
      });
      if (!resolvedWeek) return;
      return withApiCache(
        "anomalies",
        { top, minDeltaAbs, lookbackHours, scope, weekEnd: resolvedWeek?.selectedWeekEndUtc || null },
        60_000,
        async () => getAnomalies({ top, minDeltaAbs, lookbackHours, scope, weekWindow: resolvedWeek?.weekWindow || null })
      );
    }
  );

  fastify.get(
    "/api/reset-impact",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            windowHours: { type: "integer", minimum: 1, maximum: 24, default: 3 },
            weekEnd: { type: "string", maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const top = request.query.top || 20;
      const windowHours = request.query.windowHours || 3;
      const resolvedWeek = resolveWeekSelectionOrReply({
        reply,
        weekEndRaw: request.query.weekEnd,
        requireWeekWindow: true,
      });
      if (!resolvedWeek) return;
      return withApiCache(
        "reset-impact",
        { top, windowHours, weekEnd: resolvedWeek.selectedWeekEndUtc || null },
        60_000,
        async () => getResetImpact({ top, windowHours, weekWindow: resolvedWeek.weekWindow })
      );
    }
  );

  fastify.get(
    "/api/consistency",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
            days: { type: "integer", minimum: 1, maximum: 3650 },
            weekEnd: { type: "string", maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const top = request.query.top || 20;
      const scope = request.query.scope || "week";
      const days = request.query.days;
      const resolvedWeek = resolveWeekSelectionOrReply({
        reply,
        scope,
        weekEndRaw: request.query.weekEnd,
      });
      if (!resolvedWeek) return;
      return withApiCache(
        "consistency",
        { top, scope, days: days || null, weekEnd: resolvedWeek?.selectedWeekEndUtc || null },
        60_000,
        async () => getConsistencyScores({ top, scope, days, weekWindow: resolvedWeek?.weekWindow || null })
      );
    }
  );

  fastify.get(
    "/api/watchlist",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            accounts: { type: "string", maxLength: 1000, default: "" },
            minGain: { type: "integer", minimum: 0, maximum: 5000, default: 30 },
            minRankUp: { type: "integer", minimum: 0, maximum: 200, default: 3 },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
            weekEnd: { type: "string", maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const accounts = parseAccountsParam(request.query.accounts || "");
      const minGain = request.query.minGain || 30;
      const minRankUp = request.query.minRankUp || 3;
      const scope = request.query.scope || "week";
      const resolvedWeek = resolveWeekSelectionOrReply({
        reply,
        scope,
        weekEndRaw: request.query.weekEnd,
      });
      if (!resolvedWeek) return;
      return withApiCache(
        "watchlist",
        { accounts, minGain, minRankUp, scope, weekEnd: resolvedWeek?.selectedWeekEndUtc || null },
        30_000,
        async () => getWatchlistAlerts({ accounts, minGain, minRankUp, scope, weekWindow: resolvedWeek?.weekWindow || null })
      );
    }
  );

  fastify.get(
    "/api/report/weekly",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            weekEnd: { type: "string", maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const resolvedWeek = resolveWeekSelectionOrReply({
        reply,
        weekEndRaw: request.query.weekEnd,
        requireWeekWindow: true,
      });
      if (!resolvedWeek) return;
      return withApiCache(
        "weekly-report",
        { weekEnd: resolvedWeek.selectedWeekEndUtc || null },
        60_000,
        async () => {
          const scope = "week";
          const delta = getDeltaLeaderboard({ top: 30, metric: "weeklyKills", scope, weekWindow: resolvedWeek.weekWindow });
          const anomalies = getAnomalies({
            top: 15,
            minDeltaAbs: 80,
            lookbackHours: 72,
            scope,
            weekWindow: resolvedWeek.weekWindow,
          });
          const progression = getTopProgression(10, scope, null, resolvedWeek.weekWindow);
          const latest = await withApiCache("latest", { top: 100 }, 45_000, async () => {
            const snap = qLatestSnapshot.get();
            if (!snap || !snap.snapshot_id) return { snapshot: null, entries: [] };
            return {
              snapshot: {
                snapshotId: snap.snapshot_id,
                createdAt: snap.created_at,
                region: snap.region,
                count: snap.count,
              },
              entries: qLatestEntries.all(snap.snapshot_id, 100).map((row) => serializeEntryRow(row)),
            };
          });
          return { generatedAt: new Date().toISOString(), latest, delta, anomalies, progression };
        }
      );
    }
  );

  fastify.get(
    "/api/latest",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 300, default: 100 },
            weekEnd: { type: "string", maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const top = request.query.top || 100;
      let resolvedWeek = null;
      if (request.query.weekEnd) {
        resolvedWeek = resolveWeekSelectionOrReply({
          reply,
          weekEndRaw: request.query.weekEnd,
          requireWeekWindow: true,
        });
        if (!resolvedWeek) return;
      }

      return withApiCache("latest", { top, weekEnd: resolvedWeek?.selectedWeekEndUtc || null }, 45_000, async () => {
        const snap = resolvedWeek?.weekWindow
          ? getLatestSnapshotMetaInWindow(resolvedWeek.weekWindow.startUtc, resolvedWeek.weekWindow.endUtc)
          : (() => {
              const raw = qLatestSnapshot.get();
              if (!raw || !raw.snapshot_id) return null;
              return {
                snapshotId: raw.snapshot_id,
                createdAt: raw.created_at,
                region: raw.region,
                count: raw.count,
              };
            })();

        if (!snap?.snapshotId) return { snapshot: null, entries: [] };
        return {
          snapshot: {
            snapshotId: snap.snapshotId,
            createdAt: snap.createdAt,
            region: snap.region,
            count: snap.count,
          },
          entries: qLatestEntries.all(snap.snapshotId, top).map((row) => serializeEntryRow(row)),
        };
      });
    }
  );

  fastify.get(
    "/api/progression/top",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            top: { type: "integer", minimum: 1, maximum: 30, default: 10 },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
            days: { type: "integer", minimum: 1, maximum: 3650 },
            weekEnd: { type: "string", maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const top = request.query.top || 10;
      const scope = request.query.scope || "week";
      const days = request.query.days;
      const resolvedWeek = resolveWeekSelectionOrReply({
        reply,
        scope,
        weekEndRaw: request.query.weekEnd,
      });
      if (!resolvedWeek) return;
      return withApiCache(
        "progression",
        { top, scope, days: days || null, weekEnd: resolvedWeek?.selectedWeekEndUtc || null },
        60_000,
        async () => getTopProgression(top, scope, days, resolvedWeek?.weekWindow || null)
      );
    }
  );

  fastify.get(
    "/api/player/:account/history",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["account"],
          properties: {
            account: { type: "string", minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    async (request, reply) => {
      const accountName = sanitizeAccountName(request.params.account);
      if (!accountName) return reply.code(400).send({ error: "Invalid accountName" });
      return { accountName, history: qHistory.all(accountName) };
    }
  );

  fastify.get(
    "/api/compare",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            accounts: { type: "string", maxLength: 1000, default: "" },
            scope: { type: "string", enum: ["week", "all"], default: "week" },
            days: { type: "integer", minimum: 1, maximum: 3650 },
            weekEnd: { type: "string", maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const accounts = parseAccountsParam(request.query.accounts || "");
      const scope = request.query.scope || "week";
      const days = request.query.days;
      const resolvedWeek = resolveWeekSelectionOrReply({
        reply,
        scope,
        weekEndRaw: request.query.weekEnd,
      });
      if (!resolvedWeek) return;
      const hasDaysFilter = scope === "all" && Number.isFinite(Number(days)) && Number(days) > 0;
      const cutoffIso = hasDaysFilter
        ? new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
        : null;
      return withApiCache(
        "compare",
        { accounts, scope, days: hasDaysFilter ? Number(days) : null, weekEnd: resolvedWeek?.selectedWeekEndUtc || null },
        60_000,
        async () => {
          const weekWindow = resolvedWeek?.weekWindow || getCurrentWeekWindowBrussels();
          const series = getCompareSeries(accounts, scope, hasDaysFilter, cutoffIso, weekWindow);
          return {
            accounts,
            series,
            scope,
            days: hasDaysFilter ? Number(days) : null,
            weekWindow: scope === "week" ? weekWindow : null,
          };
        }
      );
    }
  );

  fastify.get(
    "/api/accounts",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string", maxLength: 80, default: "" },
            limit: { type: "integer", minimum: 1, maximum: 30, default: 10 },
          },
        },
      },
    },
    async (request) => {
      const query = String(request.query.query || "").trim();
      const limit = request.query.limit || 10;
      return withApiCache("accounts", { query, limit }, 45_000, async () => {
        const rows = qAccountSearch.all(`%${query}%`, limit);
        return { accounts: rows.map((r) => r.account_name) };
      });
    }
  );
}

module.exports = {
  registerAnalyticsRoutes,
};
