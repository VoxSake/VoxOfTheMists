function registerOpsRoutes(fastify, deps) {
  const {
    requireTrustedLocalRead,
    requireTrustedLocalWrite,
    WRITE_API_TOKEN,
    withApiCache,
    qSnapshots,
    listSelectableWeekWindows,
    snapshotStatus,
    processStartedAtIso,
    AUTO_SCRAPE_EFFECTIVE,
    AUTO_SCRAPE_ENABLED,
    getNextHourlyAtIso,
    APPWRITE_SYNC_ENABLED,
    appwriteSyncService,
    appwriteSyncStatus,
    getLatestSnapshotMeta,
    getMaintenanceHealth,
    cacheWarmStatus,
    db,
    runMaintenance,
    runSnapshotAsync,
  } = deps;

  fastify.get(
    "/api/write-auth",
    {
      preHandler: requireTrustedLocalRead,
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              token: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({ token: WRITE_API_TOKEN })
  );

  fastify.get("/api/snapshots", async () => {
    return withApiCache("snapshots", {}, 60_000, async () => {
      const snapshots = qSnapshots.all().map((row) => ({
        snapshotId: row.snapshot_id,
        createdAt: row.created_at,
        region: row.region,
        count: row.count,
      }));
      return { snapshots };
    });
  });

  fastify.get("/api/weeks", async () => {
    return withApiCache("weeks", {}, 5 * 60_000, async () => {
      const fmt = new Intl.DateTimeFormat("fr-BE", {
        timeZone: "Europe/Brussels",
        weekday: "short",
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const weeks = listSelectableWeekWindows().map((w) => ({
        weekEndUtc: w.weekEndUtc,
        startUtc: w.startUtc,
        endUtc: w.endUtc,
        label: fmt.format(new Date(w.weekEndUtc)),
        anchorSnapshotId: w.anchorSnapshotId,
        anchorCreatedAt: w.anchorCreatedAt,
      }));
      return { weeks };
    });
  });

  fastify.get(
    "/api/snapshot/status",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              running: { type: "boolean" },
              lastTrigger: { type: ["string", "null"] },
              lastStartedAt: { type: ["string", "null"] },
              lastFinishedAt: { type: ["string", "null"] },
              lastExitCode: { type: ["integer", "null"] },
              lastError: { type: ["string", "null"] },
            },
          },
        },
      },
    },
    async () => snapshotStatus
  );

  fastify.get(
    "/api/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              processStartedAt: { type: "string" },
              uptimeSeconds: { type: "integer" },
              autoScrapeEnabled: { type: "boolean" },
              autoScrapeConfigured: { type: "boolean" },
              nextHourlyAt: { type: ["string", "null"] },
              appwriteSyncEnabled: { type: "boolean" },
              appwriteSyncConfigured: { type: "boolean" },
              appwriteNextSyncAt: { type: ["string", "null"] },
              appwriteSync: {
                type: "object",
                additionalProperties: false,
                properties: {
                  enabled: { type: "boolean" },
                  running: { type: "boolean" },
                  lastTrigger: { type: ["string", "null"] },
                  lastStartedAt: { type: ["string", "null"] },
                  lastFinishedAt: { type: ["string", "null"] },
                  lastError: { type: ["string", "null"] },
                  lastFetchedSnapshots: { type: "integer" },
                  lastImportedSnapshots: { type: "integer" },
                  lastImportedEntries: { type: "integer" },
                },
              },
              latestSnapshot: {
                type: ["object", "null"],
                nullable: true,
                additionalProperties: false,
                properties: {
                  snapshotId: { type: "string" },
                  createdAt: { type: "string" },
                  region: { type: "string" },
                  count: { type: "integer" },
                },
              },
              snapshotStatus: {
                type: "object",
                additionalProperties: false,
                properties: {
                  running: { type: "boolean" },
                  lastTrigger: { type: ["string", "null"] },
                  lastStartedAt: { type: ["string", "null"] },
                  lastFinishedAt: { type: ["string", "null"] },
                  lastExitCode: { type: ["integer", "null"] },
                  lastError: { type: ["string", "null"] },
                },
              },
              maintenance: {
                type: "object",
                additionalProperties: false,
                properties: {
                  running: { type: "boolean" },
                  lastRunAt: { type: ["string", "null"] },
                  lastRunReason: { type: ["string", "null"] },
                  lastRetentionDeletedSnapshots: { type: "integer" },
                  lastRetentionDeletedEntries: { type: "integer" },
                  lastVacuumAt: { type: ["string", "null"] },
                  lastError: { type: ["string", "null"] },
                  retentionDays: { type: "integer" },
                  autoVacuumEnabled: { type: "boolean" },
                  vacuumMinHours: { type: "integer" },
                },
              },
              cacheWarm: {
                type: "object",
                additionalProperties: false,
                properties: {
                  running: { type: "boolean" },
                  lastReason: { type: ["string", "null"] },
                  lastStartedAt: { type: ["string", "null"] },
                  lastFinishedAt: { type: ["string", "null"] },
                  lastError: { type: ["string", "null"] },
                },
              },
              totals: {
                type: "object",
                additionalProperties: false,
                properties: {
                  snapshots: { type: "integer" },
                  entries: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
    async () =>
      withApiCache("health", {}, 15_000, async () => ({
        processStartedAt: processStartedAtIso,
        uptimeSeconds: Math.floor(process.uptime()),
        autoScrapeEnabled: AUTO_SCRAPE_EFFECTIVE,
        autoScrapeConfigured: AUTO_SCRAPE_ENABLED,
        nextHourlyAt: getNextHourlyAtIso(),
        appwriteSyncEnabled: APPWRITE_SYNC_ENABLED,
        appwriteSyncConfigured: APPWRITE_SYNC_ENABLED && !appwriteSyncService.getConfigError(),
        appwriteNextSyncAt: appwriteSyncService.getNextSyncAtIso(),
        appwriteSync: appwriteSyncStatus,
        latestSnapshot: getLatestSnapshotMeta(),
        snapshotStatus,
        maintenance: getMaintenanceHealth(),
        cacheWarm: cacheWarmStatus,
        totals: {
          snapshots: Number(db.prepare("SELECT COUNT(*) AS c FROM snapshots").get().c || 0),
          entries: Number(db.prepare("SELECT COUNT(*) AS c FROM snapshot_entries").get().c || 0),
        },
      }))
  );

  fastify.post(
    "/api/maintenance/run",
    {
      preHandler: requireTrustedLocalWrite,
    },
    async (_request, reply) => {
      try {
        return await runMaintenance("manual-api");
      } catch {
        return reply.code(500).send({ error: "Maintenance failed" });
      }
    }
  );

  fastify.post(
    "/api/sync/run",
    {
      preHandler: requireTrustedLocalWrite,
    },
    async (_request, reply) => {
      if (!APPWRITE_SYNC_ENABLED) {
        return reply.code(409).send({
          error: "Appwrite sync is disabled (APPWRITE_SYNC_ENABLED=0).",
          status: appwriteSyncStatus,
        });
      }
      if (appwriteSyncStatus.running) {
        return reply.code(409).send({ error: "Appwrite sync already in progress", status: appwriteSyncStatus });
      }
      try {
        const result = await appwriteSyncService.runSyncAsync("manual-api");
        appwriteSyncService.scheduleSync();
        return { ok: true, result, status: appwriteSyncStatus };
      } catch (error) {
        fastify.log.error(`[api/sync/run] Failed: ${error?.message || "unknown_error"}`);
        return reply.code(500).send({ error: "Appwrite sync failed", status: appwriteSyncStatus });
      }
    }
  );

  fastify.post(
    "/api/snapshot/run",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              ok: { type: "boolean" },
              status: {
                type: "object",
                additionalProperties: false,
                properties: {
                  running: { type: "boolean" },
                  lastTrigger: { type: ["string", "null"] },
                  lastStartedAt: { type: ["string", "null"] },
                  lastFinishedAt: { type: ["string", "null"] },
                  lastExitCode: { type: ["integer", "null"] },
                  lastError: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
      preHandler: requireTrustedLocalWrite,
    },
    async (_request, reply) => {
      if (APPWRITE_SYNC_ENABLED) {
        return reply.code(409).send({
          error:
            "Manual local snapshot disabled while Appwrite sync is enabled.",
          status: snapshotStatus,
        });
      }
      if (snapshotStatus.running) {
        return reply.code(409).send({ error: "Snapshot already in progress", status: snapshotStatus });
      }
      try {
        await runSnapshotAsync("manual");
        return { ok: true, status: snapshotStatus };
      } catch (error) {
        fastify.log.error(`[api/snapshot/run] Failed: ${error?.message || "unknown_error"}`);
        return reply.code(500).send({ error: "Snapshot failed", status: snapshotStatus });
      }
    }
  );
}

module.exports = {
  registerOpsRoutes,
};
