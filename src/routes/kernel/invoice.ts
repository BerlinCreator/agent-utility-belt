import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../db/connection.js";
import { invoices } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});

const partySchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  address: z.string().optional(),
});

const createSchema = z.object({
  from: partySchema,
  to: partySchema,
  items: z.array(lineItemSchema).min(1),
  taxRate: z.number().min(0).max(100).default(0),
  currency: z.string().length(3).default("USD"),
  dueDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  // POST /create — create a new invoice
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);

    const subtotal = body.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const taxAmount = subtotal * (body.taxRate / 100);
    const total = subtotal + taxAmount;
    const invoiceNumber = `INV-${nanoid(10).toUpperCase()}`;

    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        from: body.from,
        to: body.to,
        items: body.items,
        subtotal: subtotal.toFixed(2),
        taxRate: body.taxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        currency: body.currency,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, invoice, 201);
  });

  // GET /:id — get invoice by id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);

    if (!invoice) {
      throw new NotFoundError("Invoice not found");
    }

    sendSuccess(reply, invoice);
  });

  // GET /list — list invoices with pagination
  app.get("/list", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const where = query.status ? eq(invoices.status, query.status) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(invoices)
        .where(where)
        .orderBy(desc(invoices.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
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
