import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { gates } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const createFlagSchema = z.object({
  key: z.string().min(1).max(255),
  enabled: z.boolean().default(false),
  rolloutPercentage: z.number().int().min(0).max(100).default(100),
  description: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
  description: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const evaluateQuerySchema = z.object({
  entityId: z.string().optional(),
});

export async function gateRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/gate/flag — create a feature flag
  app.post("/flag", async (request, reply) => {
    const body = createFlagSchema.parse(request.body);

    const [flag] = await db
      .insert(gates)
      .values({
        key: body.key,
        enabled: body.enabled,
        rolloutPercentage: body.rolloutPercentage,
        description: body.description,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, flag, 201);
  });

  // GET /v1/gate/evaluate/:flagId — evaluate a flag
  app.get("/evaluate/:flagId", async (request, reply) => {
    const { flagId } = request.params as { flagId: string };
    const query = evaluateQuerySchema.parse(request.query);

    const rows = await db
      .select()
      .from(gates)
      .where(eq(gates.key, flagId))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Flag '${flagId}' not found`);

    const flag = rows[0]!;
    let isEnabled = flag.enabled;

    // Percentage-based rollout using a deterministic hash of entityId
    if (isEnabled && flag.rolloutPercentage < 100 && query.entityId) {
      const hash = simpleHash(query.entityId);
      isEnabled = (hash % 100) < flag.rolloutPercentage;
    }

    sendSuccess(reply, {
      key: flag.key,
      enabled: isEnabled,
      rolloutPercentage: flag.rolloutPercentage,
    });
  });

  // PUT /v1/gate/flag/:flagId — update a flag
  app.put("/flag/:flagId", async (request, reply) => {
    const { flagId } = request.params as { flagId: string };
    const body = updateFlagSchema.parse(request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.rolloutPercentage !== undefined) updates.rolloutPercentage = body.rolloutPercentage;
    if (body.description !== undefined) updates.description = body.description;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    const [updated] = await db
      .update(gates)
      .set(updates)
      .where(eq(gates.key, flagId))
      .returning();

    if (!updated) throw new NotFoundError(`Flag '${flagId}' not found`);

    sendSuccess(reply, updated);
  });

  // DELETE /v1/gate/flag/:flagId — delete a flag
  app.delete("/flag/:flagId", async (request, reply) => {
    const { flagId } = request.params as { flagId: string };

    const [deleted] = await db
      .delete(gates)
      .where(eq(gates.key, flagId))
      .returning();

    if (!deleted) throw new NotFoundError(`Flag '${flagId}' not found`);

    sendSuccess(reply, { deleted: true, key: flagId });
  });
}

/** Simple deterministic hash for percentage rollouts */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
