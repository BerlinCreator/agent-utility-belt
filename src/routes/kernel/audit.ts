import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { auditLogs } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";

const logSchema = z.object({
  actor: z.string().min(1).max(255),
  action: z.string().min(1).max(255),
  resource: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const querySchema = z.object({
  actor: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/audit/log — append an audit entry
  app.post("/log", async (request, reply) => {
    const body = logSchema.parse(request.body);

    const [entry] = await db
      .insert(auditLogs)
      .values({
        actor: body.actor,
        action: body.action,
        resource: body.resource,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, entry, 201);
  });

  // GET /v1/audit/logs — paginated, filterable log query
  app.get("/logs", async (request, reply) => {
    const query = querySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const conditions = [];
    if (query.actor) conditions.push(eq(auditLogs.actor, query.actor));
    if (query.action) conditions.push(eq(auditLogs.action, query.action));
    if (query.from) conditions.push(gte(auditLogs.createdAt, new Date(query.from)));
    if (query.to) conditions.push(lte(auditLogs.createdAt, new Date(query.to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
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
