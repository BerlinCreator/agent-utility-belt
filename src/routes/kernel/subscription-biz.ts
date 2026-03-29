import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { bizSubscriptions } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const createSchema = z.object({
  customerId: z.string().min(1).max(255),
  planId: z.string().min(1).max(255),
  amount: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  interval: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z.object({
  planId: z.string().min(1).max(255).optional(),
  amount: z.number().positive().optional(),
  interval: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  customerId: z.string().optional(),
  status: z.enum(["active", "paused", "cancelled", "expired"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function computePeriodEnd(start: Date, interval: "monthly" | "quarterly" | "yearly"): Date {
  const end = new Date(start);
  switch (interval) {
    case "monthly":
      end.setMonth(end.getMonth() + 1);
      break;
    case "quarterly":
      end.setMonth(end.getMonth() + 3);
      break;
    case "yearly":
      end.setFullYear(end.getFullYear() + 1);
      break;
  }
  return end;
}

export async function subscriptionBizRoutes(app: FastifyInstance): Promise<void> {
  // POST /create — create a new subscription
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);

    const now = new Date();
    const periodEnd = computePeriodEnd(now, body.interval);

    const [subscription] = await db
      .insert(bizSubscriptions)
      .values({
        customerId: body.customerId,
        planId: body.planId,
        amount: body.amount.toFixed(2),
        currency: body.currency,
        interval: body.interval,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, subscription, 201);
  });

  // GET /:id — get subscription by id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [subscription] = await db
      .select()
      .from(bizSubscriptions)
      .where(eq(bizSubscriptions.id, id))
      .limit(1);

    if (!subscription) {
      throw new NotFoundError("Subscription not found");
    }

    sendSuccess(reply, subscription);
  });

  // PUT /:id — update a subscription
  app.put("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(bizSubscriptions)
      .where(eq(bizSubscriptions.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Subscription not found");
    }

    if (existing.status === "cancelled") {
      throw new ValidationError("Cannot update a cancelled subscription");
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.planId !== undefined) updateData.planId = body.planId;
    if (body.amount !== undefined) updateData.amount = body.amount.toFixed(2);
    if (body.interval !== undefined) updateData.interval = body.interval;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    const [updated] = await db
      .update(bizSubscriptions)
      .set(updateData)
      .where(eq(bizSubscriptions.id, id))
      .returning();

    sendSuccess(reply, updated);
  });

  // POST /cancel/:id — cancel a subscription
  app.post("/cancel/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [existing] = await db
      .select()
      .from(bizSubscriptions)
      .where(eq(bizSubscriptions.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Subscription not found");
    }

    if (existing.status === "cancelled") {
      throw new ValidationError("Subscription is already cancelled");
    }

    const [cancelled] = await db
      .update(bizSubscriptions)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bizSubscriptions.id, id))
      .returning();

    sendSuccess(reply, cancelled);
  });

  // GET /list — list subscriptions with pagination
  app.get("/list", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const conditions = [];
    if (query.customerId) conditions.push(eq(bizSubscriptions.customerId, query.customerId));
    if (query.status) conditions.push(eq(bizSubscriptions.status, query.status));

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`
      : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(bizSubscriptions)
        .where(where)
        .orderBy(desc(bizSubscriptions.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(bizSubscriptions)
        .where(where),
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
}
