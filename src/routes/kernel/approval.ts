import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { approvalRequests } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const requestSchema = z.object({
  type: z.string().min(1).max(100),
  requesterId: z.string().min(1).max(255),
  data: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const decisionSchema = z.object({
  decidedBy: z.string().min(1).max(255),
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  type: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  requesterId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function approvalRoutes(app: FastifyInstance): Promise<void> {
  // POST /request — create an approval request
  app.post("/request", async (request, reply) => {
    const body = requestSchema.parse(request.body);

    const [approvalRequest] = await db
      .insert(approvalRequests)
      .values({
        type: body.type,
        requesterId: body.requesterId,
        data: body.data,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, approvalRequest, 201);
  });

  // POST /:id/approve — approve a request
  app.post("/:id/approve", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = decisionSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Approval request not found");
    }

    if (existing.status !== "pending") {
      throw new ValidationError(
        `Request is already ${existing.status}. Only pending requests can be approved.`,
      );
    }

    const [approved] = await db
      .update(approvalRequests)
      .set({
        status: "approved",
        decidedBy: body.decidedBy,
        reason: body.reason,
        metadata: body.metadata
          ? { ...(existing.metadata as Record<string, unknown> | null), ...body.metadata }
          : existing.metadata,
        updatedAt: new Date(),
      })
      .where(eq(approvalRequests.id, id))
      .returning();

    sendSuccess(reply, approved);
  });

  // POST /:id/reject — reject a request
  app.post("/:id/reject", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = decisionSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Approval request not found");
    }

    if (existing.status !== "pending") {
      throw new ValidationError(
        `Request is already ${existing.status}. Only pending requests can be rejected.`,
      );
    }

    const [rejected] = await db
      .update(approvalRequests)
      .set({
        status: "rejected",
        decidedBy: body.decidedBy,
        reason: body.reason,
        metadata: body.metadata
          ? { ...(existing.metadata as Record<string, unknown> | null), ...body.metadata }
          : existing.metadata,
        updatedAt: new Date(),
      })
      .where(eq(approvalRequests.id, id))
      .returning();

    sendSuccess(reply, rejected);
  });

  // GET /:id — get approval request by id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [approvalRequest] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, id))
      .limit(1);

    if (!approvalRequest) {
      throw new NotFoundError("Approval request not found");
    }

    sendSuccess(reply, approvalRequest);
  });

  // GET /list — list approval requests with pagination
  app.get("/list", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const conditions = [];
    if (query.type) conditions.push(eq(approvalRequests.type, query.type));
    if (query.status) conditions.push(eq(approvalRequests.status, query.status));
    if (query.requesterId) conditions.push(eq(approvalRequests.requesterId, query.requesterId));

    const where = conditions.length > 0
      ? conditions.reduce((acc, cond) => (acc ? sql`${acc} AND ${cond}` : cond))
      : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(approvalRequests)
        .where(where)
        .orderBy(desc(approvalRequests.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(approvalRequests)
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
