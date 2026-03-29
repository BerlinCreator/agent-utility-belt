import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { handoffs } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const createSchema = z.object({
  fromAgent: z.string().min(1).max(255),
  toAgent: z.string().min(1).max(255),
  task: z.string().min(1).max(5000),
  context: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function handoffRoutes(app: FastifyInstance): Promise<void> {
  // POST /create — create a handoff
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);

    const [created] = await db
      .insert(handoffs)
      .values({
        fromAgent: body.fromAgent,
        toAgent: body.toAgent,
        task: body.task,
        context: body.context,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // GET /:id — get a handoff
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db.select().from(handoffs).where(eq(handoffs.id, id)).limit(1);
    if (rows.length === 0) throw new NotFoundError(`Handoff '${id}' not found`);

    sendSuccess(reply, rows[0]);
  });

  // PUT /:id/accept — accept a handoff
  app.put("/:id/accept", async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await db.select().from(handoffs).where(eq(handoffs.id, id)).limit(1);
    if (existing.length === 0) throw new NotFoundError(`Handoff '${id}' not found`);
    if (existing[0]!.status !== "pending") {
      throw new ValidationError(`Handoff is already '${existing[0]!.status}'`);
    }

    const [updated] = await db
      .update(handoffs)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(handoffs.id, id))
      .returning();

    sendSuccess(reply, updated);
  });

  // PUT /:id/reject — reject a handoff
  app.put("/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await db.select().from(handoffs).where(eq(handoffs.id, id)).limit(1);
    if (existing.length === 0) throw new NotFoundError(`Handoff '${id}' not found`);
    if (existing[0]!.status !== "pending") {
      throw new ValidationError(`Handoff is already '${existing[0]!.status}'`);
    }

    const [updated] = await db
      .update(handoffs)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(handoffs.id, id))
      .returning();

    sendSuccess(reply, updated);
  });

  // GET /list — list handoffs
  app.get("/list", async (request, reply) => {
    const rows = await db.select().from(handoffs).orderBy(desc(handoffs.createdAt)).limit(100);
    sendSuccess(reply, rows);
  });
}
