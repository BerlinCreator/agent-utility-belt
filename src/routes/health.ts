import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { sendSuccess } from "../utils/response.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Lightweight liveness probe (no dependency checks)
  app.get("/health", async (_request, reply) => {
    sendSuccess(reply, {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      uptime: process.uptime(),
    });
  });

  // Deep readiness probe — verifies database connectivity
  app.get("/health/ready", async (_request, reply) => {
    const checks: Record<string, string> = {};

    try {
      await db.execute(sql`SELECT 1`);
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    const allOk = Object.values(checks).every((v) => v === "ok");

    void reply.code(allOk ? 200 : 503).send({
      success: allOk,
      data: {
        status: allOk ? "ready" : "degraded",
        timestamp: new Date().toISOString(),
        checks,
      },
    });
  });
}
