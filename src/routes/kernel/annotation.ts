import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { annotations } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const createSchema = z.object({
  target: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  body: z.string().max(10000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z.object({
  label: z.string().min(1).max(255).optional(),
  body: z.string().max(10000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function annotationRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/annotation/create
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);

    const [created] = await db
      .insert(annotations)
      .values({
        target: body.target,
        label: body.label,
        body: body.body,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // GET /v1/annotation/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(annotations)
      .where(eq(annotations.id, id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Annotation '${id}' not found`);

    sendSuccess(reply, rows[0]);
  });

  // PUT /v1/annotation/:id
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.parse(request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.label !== undefined) updates["label"] = body.label;
    if (body.body !== undefined) updates["body"] = body.body;
    if (body.metadata !== undefined) updates["metadata"] = body.metadata;

    const [updated] = await db
      .update(annotations)
      .set(updates)
      .where(eq(annotations.id, id))
      .returning();

    if (!updated) throw new NotFoundError(`Annotation '${id}' not found`);

    sendSuccess(reply, updated);
  });

  // DELETE /v1/annotation/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db
      .delete(annotations)
      .where(eq(annotations.id, id))
      .returning();

    if (!deleted) throw new NotFoundError(`Annotation '${id}' not found`);

    sendSuccess(reply, { deleted: true, id });
  });

  // GET /v1/annotation/list
  app.get("/list", async (_request, reply) => {
    const rows = await db
      .select()
      .from(annotations)
      .limit(100);

    sendSuccess(reply, { annotations: rows, count: rows.length });
  });
}
