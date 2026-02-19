const { registerOpsRoutes } = require("./opsRoutes");
const { registerAnalyticsRoutes } = require("./analyticsRoutes");
const { registerShareRoutes } = require("./shareRoutes");
const { registerGuildRoutes } = require("./guildRoutes");
const { registerStaticRoutes } = require("./staticRoutes");

async function registerAllRoutes(fastify, deps) {
  registerOpsRoutes(fastify, deps.ops);
  registerAnalyticsRoutes(fastify, deps.analytics);
  registerShareRoutes(fastify, deps.share);
  registerGuildRoutes(fastify, deps.guild);
  await registerStaticRoutes(fastify, deps.static);
}

module.exports = {
  registerAllRoutes,
};
