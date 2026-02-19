const fastifyStatic = require("@fastify/static");

async function registerStaticRoutes(fastify, deps) {
  const {
    HAS_DIST,
    DIST_DIR,
    IS_PROD,
  } = deps;

  if (HAS_DIST) {
    await fastify.register(fastifyStatic, { root: DIST_DIR, wildcard: false });
    fastify.get("/*", async (request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
    return;
  }

  if (IS_PROD) {
    fastify.log.warn("dist/ not found. Run `npm run build` before starting production server.");
    fastify.get("/", async (_request, reply) => {
      reply.code(503).type("text/html; charset=utf-8");
      return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VoxOfTheMists</title>
  </head>
  <body style="font-family: Arial, sans-serif; margin: 2rem;">
    <h1>Frontend build is missing</h1>
    <p>Run <code>npm run build</code> and restart the server.</p>
    <p>API endpoints remain available under <code>/api/*</code>.</p>
  </body>
</html>`;
    });
    fastify.get("/*", async (request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.redirect("/");
    });
  }
}

module.exports = {
  registerStaticRoutes,
};
