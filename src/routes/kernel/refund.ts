import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { refunds } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

// Valid state transitions for the refund state machine
const VALID_TRANSITIONS: Record<string, string[]> = {
  requested: ["approved", "rejected"],
  approved: ["processing"],
  processing: ["completed"],
  rejected: [],
  completed: [],
};

const requestSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const statusUpdateSchema = z.object({
  status: z.enum(["approved", "processing", "completed", "rejected"]),
  processedBy: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  invoiceId: z.string().uuid().optional(),
  status: z.enum(["requested", "approved", "processing", "completed", "rejected"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function refundRoutes(app: FastifyInstance): Promise<void> {
  // POST /request — request a refund
  app.post("/request", async (request, reply) => {
    const body = requestSchema.parse(request.body);

    const [refund] = await db
      .insert(refunds)
      .values({
        invoiceId: body.invoiceId,
        amount: body.amount.toFixed(2),
        reason: body.reason,
        status: "requested",
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, refund, 201);
  });

  // PUT /:id/status — update refund status (state machine)
  app.put("/:id/status", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = statusUpdateSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(refunds)
      .where(eq(refunds.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Refund not found");
    }

    const allowedTransitions = VALID_TRANSITIONS[existing.status];
    if (!allowedTransitions || !allowedTransitions.includes(body.status)) {
      throw new ValidationError(
        `Cannot transition from '${existing.status}' to '${body.status}'. Allowed: ${(allowedTransitions ?? []).join(", ") || "none"}`,
      );
    }

    const updateData: Record<string, unknown> = {
      status: body.status,
      updatedAt: new Date(),
    };
    if (body.processedBy) updateData.processedBy = body.processedBy;
    if (body.metadata) updateData.metadata = { ...(existing.metadata as Record<string, unknown> | null), ...body.metadata };

    const [updated] = await db
      .update(refunds)
      .set(updateData)
      .where(eq(refunds.id, id))
      .returning();

    sendSuccess(reply, updated);
  });

  // GET /:id — get refund by id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [refund] = await db
      .select()
      .from(refunds)
      .where(eq(refunds.id, id))
      .limit(1);

    if (!refund) {
      throw new NotFoundError("Refund not found");
    }

    sendSuccess(reply, refund);
  });

  // GET /list — list refunds with pagination
  app.get("/list", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const conditions = [];
    if (query.invoiceId) conditions.push(eq(refunds.invoiceId, query.invoiceId));
    if (query.status) conditions.push(eq(refunds.status, query.status));

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`
      : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(refunds)
        .where(where)
        .orderBy(desc(refunds.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(refunds)
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
