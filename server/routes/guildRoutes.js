function registerGuildRoutes(fastify, deps) {
  const {
    requireTrustedLocalWrite,
    requireTrustedLocalRead,
    GUILD_SEARCH_MAX_PAGES,
    GUILD_SEARCH_MAX_PER_PAGE,
    createGuildSearchJob,
    cleanupGuildSearchJobs,
    guildSearchJobs,
  } = deps;

  fastify.post(
    "/api/guild-search/run",
    {
      preHandler: requireTrustedLocalWrite,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1, maxLength: 120 },
            region: { type: "string", enum: ["eu", "na"], default: "eu" },
            maxPages: { type: "integer", minimum: 1, maximum: GUILD_SEARCH_MAX_PAGES, default: GUILD_SEARCH_MAX_PAGES },
            perPage: { type: "integer", minimum: 10, maximum: GUILD_SEARCH_MAX_PER_PAGE, default: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const query = String(request.body?.query || "").trim();
      if (!query) return reply.code(400).send({ error: "Missing query." });
      const region = request.body?.region === "na" ? "na" : "eu";
      const maxPages = Math.max(
        1,
        Math.min(GUILD_SEARCH_MAX_PAGES, Number(request.body?.maxPages || GUILD_SEARCH_MAX_PAGES))
      );
      const perPage = Math.max(10, Math.min(GUILD_SEARCH_MAX_PER_PAGE, Number(request.body?.perPage || 100)));
      const job = createGuildSearchJob({ query, region, maxPages, perPage });
      request.log.info(
        { route: "/api/guild-search/run", requestId: request.id, jobId: job.id, query, region, maxPages, perPage },
        "Started guild search job"
      );
      return { ok: true, jobId: job.id };
    }
  );

  fastify.get(
    "/api/guild-search/:jobId",
    {
      preHandler: requireTrustedLocalRead,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["jobId"],
          properties: {
            jobId: { type: "string", minLength: 1, maxLength: 80 },
          },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, maximum: 100000, default: 1 },
            pageSize: { type: "integer", minimum: 10, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      cleanupGuildSearchJobs();
      const jobId = String(request.params.jobId || "").trim();
      const page = Math.max(1, Number(request.query.page || 1));
      const pageSize = Math.max(10, Math.min(200, Number(request.query.pageSize || 50)));
      const job = guildSearchJobs.get(jobId);
      if (!job) return reply.code(404).send({ error: "Guild search job not found." });

      const totalRows = job.rows.length;
      const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * pageSize;
      const rows = job.rows.slice(start, start + pageSize);
      return {
        jobId: job.id,
        query: job.query,
        region: job.region,
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        error: job.error,
        pagesFetched: job.pagesFetched,
        pagesTotal: job.pagesTotal,
        maxPages: job.maxPages,
        perPage: job.perPage,
        totalAvailable: job.totalAvailable,
        resultCount: job.resultCount,
        pagination: {
          page: safePage,
          pageSize,
          totalRows,
          totalPages,
          startIndex: totalRows ? start + 1 : 0,
          endIndex: totalRows ? Math.min(start + pageSize, totalRows) : 0,
        },
        rows,
      };
    }
  );
}

module.exports = {
  registerGuildRoutes,
};
