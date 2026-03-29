import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { expenses } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const createSchema = z.object({
  category: z.string().min(1).max(100),
  amount: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  description: z.string().optional(),
  date: z.string().datetime(),
  receipt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  description: z.string().optional(),
  date: z.string().datetime().optional(),
  status: z.enum(["pending", "approved", "rejected", "reimbursed"]).optional(),
  receipt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  category: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected", "reimbursed"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const summaryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function expenseRoutes(app: FastifyInstance): Promise<void> {
  // POST /create — create a new expense
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);

    const [expense] = await db
      .insert(expenses)
      .values({
        category: body.category,
        amount: body.amount.toFixed(2),
        currency: body.currency,
        description: body.description,
        date: new Date(body.date),
        receipt: body.receipt,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, expense, 201);
  });

  // GET /:id — get expense by id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id))
      .limit(1);

    if (!expense) {
      throw new NotFoundError("Expense not found");
    }

    sendSuccess(reply, expense);
  });

  // PUT /:id — update an expense
  app.put("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateSchema.parse(request.body);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.category !== undefined) updateData.category = body.category;
    if (body.amount !== undefined) updateData.amount = body.amount.toFixed(2);
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.date !== undefined) updateData.date = new Date(body.date);
    if (body.status !== undefined) updateData.status = body.status;
    if (body.receipt !== undefined) updateData.receipt = body.receipt;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    const [updated] = await db
      .update(expenses)
      .set(updateData)
      .where(eq(expenses.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError("Expense not found");
    }

    sendSuccess(reply, updated);
  });

  // DELETE /:id — delete an expense
  app.delete("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [deleted] = await db
      .delete(expenses)
      .where(eq(expenses.id, id))
      .returning();

    if (!deleted) {
      throw new NotFoundError("Expense not found");
    }

    sendSuccess(reply, { deleted: true, id });
  });

  // GET /list — list expenses with pagination and filters
  app.get("/list", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const conditions = [];
    if (query.category) conditions.push(eq(expenses.category, query.category));
    if (query.status) conditions.push(eq(expenses.status, query.status));
    if (query.from) conditions.push(gte(expenses.date, new Date(query.from)));
    if (query.to) conditions.push(lte(expenses.date, new Date(query.to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(expenses)
        .where(where)
        .orderBy(desc(expenses.date))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(expenses)
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

  // GET /summary — expense summary by category
  app.get("/summary", async (request, reply) => {
    const query = summaryQuerySchema.parse(request.query);

    const conditions = [];
    if (query.from) conditions.push(gte(expenses.date, new Date(query.from)));
    if (query.to) conditions.push(lte(expenses.date, new Date(query.to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const summary = await db
      .select({
        category: expenses.category,
        totalAmount: sql<string>`sum(${expenses.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .where(where)
      .groupBy(expenses.category);

    const grandTotal = summary.reduce(
      (sum, row) => sum + parseFloat(row.totalAmount || "0"),
      0,
    );

    sendSuccess(reply, { categories: summary, grandTotal: grandTotal.toFixed(2) });
  });
}
