import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { checkpoints } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const saveSchema = z.object({
  agentId: z.string().min(1).max(255),
  state: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function checkpointRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/checkpoint/save
  app.post("/save", async (request, reply) => {
    const body = saveSchema.parse(request.body);

    // Get the latest version for this agent
    const latestRows = await db
      .select({ maxVersion: sql<number>`coalesce(max(${checkpoints.version}), 0)` })
      .from(checkpoints)
      .where(eq(checkpoints.agentId, body.agentId));

    const nextVersion = (latestRows[0]?.maxVersion ?? 0) + 1;

    const [saved] = await db
      .insert(checkpoints)
      .values({
        agentId: body.agentId,
        state: body.state,
        metadata: body.metadata,
        version: nextVersion,
      })
      .returning();

    sendSuccess(reply, saved, 201);
  });

  // GET /v1/checkpoint/latest/:agentId
  app.get("/latest/:agentId", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };

    const rows = await db
      .select()
      .from(checkpoints)
      .where(eq(checkpoints.agentId, agentId))
      .orderBy(desc(checkpoints.version))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`No checkpoints for agent '${agentId}'`);

    sendSuccess(reply, rows[0]);
  });

  // GET /v1/checkpoint/list/:agentId
  app.get("/list/:agentId", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(checkpoints)
        .where(eq(checkpoints.agentId, agentId))
        .orderBy(desc(checkpoints.version))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(checkpoints)
        .where(eq(checkpoints.agentId, agentId)),
    ]);

    const total = countResult[0]?.count ?? 0;

    void reply.send({
      success: true,
      data: rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  });

  // GET /v1/checkpoint/:checkpointId
  app.get("/:checkpointId", async (request, reply) => {
    const { checkpointId } = request.params as { checkpointId: string };

    const rows = await db
      .select()
      .from(checkpoints)
      .where(eq(checkpoints.id, checkpointId))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Checkpoint '${checkpointId}' not found`);

    sendSuccess(reply, rows[0]);
  });
}
