import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { schedules } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

// Simple cron expression validator (5-part: min hour dom month dow)
const CRON_REGEX = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

function isValidCron(expr: string): boolean {
  return CRON_REGEX.test(expr.trim());
}

function nextCronRun(_cronExpr: string): Date {
  // Simplified: returns a future timestamp. In production, use a proper cron parser.
  // For now, schedule 1 minute from now as a placeholder.
  const next = new Date();
  next.setMinutes(next.getMinutes() + 1, 0, 0);
  return next;
}

const createSchema = z.object({
  name: z.string().max(255).optional(),
  cronExpression: z.string().min(1).max(100),
  callbackUrl: z.string().url(),
  payload: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z.object({
  name: z.string().max(255).optional(),
  cronExpression: z.string().min(1).max(100).optional(),
  callbackUrl: z.string().url().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/schedule/create
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);

    if (!isValidCron(body.cronExpression)) {
      throw new ValidationError(`Invalid cron expression: '${body.cronExpression}'`);
    }

    const nextRunAt = nextCronRun(body.cronExpression);

    const [created] = await db
      .insert(schedules)
      .values({
        name: body.name,
        cronExpression: body.cronExpression,
        callbackUrl: body.callbackUrl,
        payload: body.payload,
        nextRunAt,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // GET /v1/schedule/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Schedule '${id}' not found`);

    sendSuccess(reply, rows[0]);
  });

  // GET /v1/schedule/list
  app.get("/list", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(schedules)
        .orderBy(desc(schedules.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schedules),
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

  // PUT /v1/schedule/:id
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.parse(request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.callbackUrl !== undefined) updates.callbackUrl = body.callbackUrl;
    if (body.payload !== undefined) updates.payload = body.payload;
    if (body.metadata !== undefined) updates.metadata = body.metadata;
    if (body.cronExpression !== undefined) {
      if (!isValidCron(body.cronExpression)) {
        throw new ValidationError(`Invalid cron expression: '${body.cronExpression}'`);
      }
      updates.cronExpression = body.cronExpression;
      updates.nextRunAt = nextCronRun(body.cronExpression);
    }

    const [updated] = await db
      .update(schedules)
      .set(updates)
      .where(eq(schedules.id, id))
      .returning();

    if (!updated) throw new NotFoundError(`Schedule '${id}' not found`);

    sendSuccess(reply, updated);
  });

  // DELETE /v1/schedule/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db.delete(schedules).where(eq(schedules.id, id)).returning();
    if (!deleted) throw new NotFoundError(`Schedule '${id}' not found`);

    sendSuccess(reply, { deleted: true, id });
  });

  // POST /v1/schedule/pause/:id
  app.post("/pause/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [updated] = await db
      .update(schedules)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(schedules.id, id))
      .returning();

    if (!updated) throw new NotFoundError(`Schedule '${id}' not found`);

    sendSuccess(reply, updated);
  });

  // POST /v1/schedule/resume/:id
  app.post("/resume/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Schedule '${id}' not found`);

    const schedule = rows[0]!;
    const nextRunAt = nextCronRun(schedule.cronExpression);

    const [updated] = await db
      .update(schedules)
      .set({ status: "active", nextRunAt, updatedAt: new Date() })
      .where(eq(schedules.id, id))
      .returning();

    sendSuccess(reply, updated);
  });
}
