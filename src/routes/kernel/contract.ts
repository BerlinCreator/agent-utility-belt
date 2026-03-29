import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { contracts } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const partySchema = z.object({
  name: z.string().min(1).max(255),
  role: z.string().min(1).max(100),
  email: z.string().email().optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(255),
  parties: z.array(partySchema).min(2),
  templateId: z.string().max(100).optional(),
  content: z.string().min(1),
  variables: z.record(z.string(), z.unknown()).optional(),
  effectiveDate: z.string().datetime().optional(),
  expirationDate: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["draft", "active", "expired", "terminated"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function mergeTemplate(content: string, variables: Record<string, unknown>): string {
  let merged = content;
  for (const [key, value] of Object.entries(variables)) {
    merged = merged.replaceAll(`{{${key}}}`, String(value));
  }
  return merged;
}

export async function contractRoutes(app: FastifyInstance): Promise<void> {
  // POST /create — create a new contract
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);

    const mergedContent = body.variables
      ? mergeTemplate(body.content, body.variables)
      : body.content;

    const [contract] = await db
      .insert(contracts)
      .values({
        title: body.title,
        parties: body.parties,
        templateId: body.templateId,
        content: mergedContent,
        variables: body.variables,
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
        expirationDate: body.expirationDate ? new Date(body.expirationDate) : null,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, contract, 201);
  });

  // GET /:id — get contract by id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, id))
      .limit(1);

    if (!contract) {
      throw new NotFoundError("Contract not found");
    }

    sendSuccess(reply, contract);
  });

  // GET /list — list contracts with pagination
  app.get("/list", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const where = query.status ? eq(contracts.status, query.status) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(contracts)
        .where(where)
        .orderBy(desc(contracts.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contracts)
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
