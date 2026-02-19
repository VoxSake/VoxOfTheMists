function registerShareRoutes(fastify, deps) {
  const {
    requireTrustedLocalWrite,
    isValidDiscordWebhookUrl,
    maskDiscordWebhookUrl,
  } = deps;

  fastify.post(
    "/api/share/discord",
    {
      preHandler: requireTrustedLocalWrite,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["webhookUrl", "filename", "html"],
          properties: {
            webhookUrl: { type: "string", minLength: 1, maxLength: 500 },
            filename: { type: "string", minLength: 1, maxLength: 120 },
            html: { type: "string", minLength: 1, maxLength: 900000 },
            content: { type: "string", maxLength: 500 },
          },
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              ok: { type: "boolean" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const webhookUrl = String(request.body?.webhookUrl || "").trim();
      const filename = String(request.body?.filename || "snapshot.html").trim();
      const html = String(request.body?.html || "");
      const content = String(request.body?.content || "").trim();
      const webhookMasked = maskDiscordWebhookUrl(webhookUrl);

      if (!isValidDiscordWebhookUrl(webhookUrl)) {
        request.log.warn(
          { route: "/api/share/discord", requestId: request.id, webhook: webhookMasked },
          "Rejected invalid Discord webhook URL"
        );
        return reply.code(400).send({ error: "Invalid Discord webhook URL." });
      }
      if (!html) return reply.code(400).send({ error: "Missing HTML payload." });

      request.log.info(
        {
          route: "/api/share/discord",
          requestId: request.id,
          webhook: webhookMasked,
          filename,
          htmlBytes: Buffer.byteLength(html, "utf8"),
          hasContent: Boolean(content),
        },
        "Starting Discord snapshot upload"
      );

      const form = new FormData();
      form.append("file", new Blob([html], { type: "text/html;charset=utf-8;" }), filename);
      if (content) form.append("content", content);

      const discordRes = await fetch(webhookUrl, {
        method: "POST",
        body: form,
      });
      if (!discordRes.ok) {
        const errorText = await discordRes.text().catch(() => "");
        request.log.warn(
          {
            route: "/api/share/discord",
            requestId: request.id,
            webhook: webhookMasked,
            status: discordRes.status,
            errorPreview: errorText.slice(0, 180),
          },
          "Discord snapshot upload failed"
        );
        return reply.code(502).send({
          error: `Discord webhook upload failed (${discordRes.status})${errorText ? `: ${errorText.slice(0, 180)}` : ""}`,
        });
      }
      request.log.info(
        { route: "/api/share/discord", requestId: request.id, webhook: webhookMasked },
        "Discord snapshot upload succeeded"
      );
      return { ok: true };
    }
  );

  fastify.post(
    "/api/share/discord/test",
    {
      preHandler: requireTrustedLocalWrite,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["webhookUrl"],
          properties: {
            webhookUrl: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            properties: {
              ok: { type: "boolean" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const webhookUrl = String(request.body?.webhookUrl || "").trim();
      const webhookMasked = maskDiscordWebhookUrl(webhookUrl);
      if (!isValidDiscordWebhookUrl(webhookUrl)) {
        request.log.warn(
          { route: "/api/share/discord/test", requestId: request.id, webhook: webhookMasked },
          "Rejected invalid Discord webhook URL for test"
        );
        return reply.code(400).send({ error: "Invalid Discord webhook URL." });
      }
      request.log.info(
        { route: "/api/share/discord/test", requestId: request.id, webhook: webhookMasked },
        "Starting Discord webhook test message"
      );
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `Vox webhook test OK (${new Date().toISOString()})`,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        request.log.warn(
          {
            route: "/api/share/discord/test",
            requestId: request.id,
            webhook: webhookMasked,
            status: response.status,
            errorPreview: errorText.slice(0, 180),
          },
          "Discord webhook test failed"
        );
        return reply.code(502).send({
          error: `Discord webhook test failed (${response.status})${errorText ? `: ${errorText.slice(0, 180)}` : ""}`,
        });
      }
      request.log.info(
        { route: "/api/share/discord/test", requestId: request.id, webhook: webhookMasked },
        "Discord webhook test succeeded"
      );
      return { ok: true };
    }
  );
}

module.exports = {
  registerShareRoutes,
};
