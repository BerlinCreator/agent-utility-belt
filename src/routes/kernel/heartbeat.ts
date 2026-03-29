import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { heartbeats } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const registerSchema = z.object({
  agentId: z.string().min(1).max(255),
  name: z.string().max(255).optional(),
  staleThresholdMs: z.number().int().min(1000).default(30000),
  deadThresholdMs: z.number().int().min(1000).default(120000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function computeStatus(lastPing: Date, staleMs: number, deadMs: number): "alive" | "stale" | "dead" {
  const elapsed = Date.now() - lastPing.getTime();
  if (elapsed > deadMs) return "dead";
  if (elapsed > staleMs) return "stale";
  return "alive";
}

export async function heartbeatRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/heartbeat/register — register or ping an agent
  app.post("/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);

    const existing = await db
      .select()
      .from(heartbeats)
      .where(eq(heartbeats.agentId, body.agentId))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(heartbeats)
        .set({ lastPing: new Date(), metadata: body.metadata ?? existing[0]!.metadata })
        .where(eq(heartbeats.agentId, body.agentId))
        .returning();
      sendSuccess(reply, updated, 200);
      return;
    }

    const [created] = await db
      .insert(heartbeats)
      .values({
        agentId: body.agentId,
        name: body.name,
        staleThresholdMs: body.staleThresholdMs,
        deadThresholdMs: body.deadThresholdMs,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // GET /v1/heartbeat/status/:id — get agent status
  app.get("/status/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(heartbeats)
      .where(eq(heartbeats.agentId, id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Agent '${id}' not found`);

    const agent = rows[0]!;
    const status = computeStatus(agent.lastPing, agent.staleThresholdMs, agent.deadThresholdMs);
    const elapsedMs = Date.now() - agent.lastPing.getTime();

    sendSuccess(reply, {
      ...agent,
      status,
      elapsedMs,
    });
  });

  // GET /v1/heartbeat/check/:id — lightweight alive check
  app.get("/check/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(heartbeats)
      .where(eq(heartbeats.agentId, id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Agent '${id}' not found`);

    const agent = rows[0]!;
    const status = computeStatus(agent.lastPing, agent.staleThresholdMs, agent.deadThresholdMs);

    sendSuccess(reply, { agentId: id, status, alive: status === "alive" });
  });
}
