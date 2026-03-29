import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { feedbacks } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const submitSchema = z.object({
  entityId: z.string().min(1).max(255),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/feedback/submit
  app.post("/submit", async (request, reply) => {
    const body = submitSchema.parse(request.body);

    const [created] = await db
      .insert(feedbacks)
      .values({
        entityId: body.entityId,
        rating: body.rating,
        comment: body.comment,
        tags: body.tags,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // GET /v1/feedback/aggregate/:entityId
  app.get("/aggregate/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };

    const rows = await db
      .select()
      .from(feedbacks)
      .where(eq(feedbacks.entityId, entityId));

    if (rows.length === 0) {
      throw new NotFoundError(`No feedback found for entity '${entityId}'`);
    }

    const ratings = rows.map((r) => r.rating);
    const sum = ratings.reduce((a, b) => a + b, 0);
    const avg = sum / ratings.length;

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of ratings) {
      distribution[r] = (distribution[r] ?? 0) + 1;
    }

    sendSuccess(reply, {
      entityId,
      count: rows.length,
      averageRating: Math.round(avg * 100) / 100,
      distribution,
      latest: rows[rows.length - 1],
    });
  });

  // GET /v1/feedback/list
  app.get("/list", async (_request, reply) => {
    const rows = await db
      .select()
      .from(feedbacks)
      .limit(100);

    sendSuccess(reply, { feedbacks: rows, count: rows.length });
  });
}
