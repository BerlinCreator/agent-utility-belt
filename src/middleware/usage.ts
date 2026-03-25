import type { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db/connection.js";
import { usageLogs } from "../db/schema.js";

export function usageTrackingHook() {
  return async function onResponse(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const apiKeyId = request.apiKeyId;
    if (!apiKeyId) return;

    const responseTime = Math.round(reply.elapsedTime);

    // Fire and forget — don't block the response
    db.insert(usageLogs)
      .values({
        apiKeyId,
        endpoint: request.url,
        method: request.method,
        statusCode: reply.statusCode,
        responseTimeMs: responseTime,
        requestMeta: {
          userAgent: request.headers["user-agent"],
          ip: request.ip,
        },
      })
      .catch((err) => {
        console.error("Failed to log usage:", err);
      });
  };
}
