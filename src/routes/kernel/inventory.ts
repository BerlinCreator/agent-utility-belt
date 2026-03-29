import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { inventoryItems } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const createSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  quantity: z.number().int().nonnegative().default(0),
  price: z.number().nonnegative(),
  currency: z.string().length(3).default("USD"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const stockUpdateSchema = z.object({
  quantity: z.number().int(),
  reason: z.string().optional(),
});

const reserveSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const releaseSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  // POST /item — create an inventory item
  app.post("/item", async (request, reply) => {
    const body = createSchema.parse(request.body);

    const [item] = await db
      .insert(inventoryItems)
      .values({
        sku: body.sku,
        name: body.name,
        description: body.description,
        quantity: body.quantity,
        price: body.price.toFixed(2),
        currency: body.currency,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, item, 201);
  });

  // PUT /:id/stock — update stock level (absolute set)
  app.put("/:id/stock", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = stockUpdateSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Inventory item not found");
    }

    const newQuantity = existing.quantity + body.quantity;
    if (newQuantity < 0) {
      throw new ValidationError(
        `Insufficient stock. Current: ${existing.quantity}, requested change: ${body.quantity}`,
      );
    }

    const [updated] = await db
      .update(inventoryItems)
      .set({ quantity: newQuantity, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning();

    sendSuccess(reply, updated);
  });

  // GET /:id — get inventory item by id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);

    if (!item) {
      throw new NotFoundError("Inventory item not found");
    }

    sendSuccess(reply, {
      ...item,
      availableQuantity: item.quantity - item.reservedQuantity,
    });
  });

  // GET /list — list inventory items with pagination
  app.get("/list", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(inventoryItems)
        .orderBy(desc(inventoryItems.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(inventoryItems),
    ]);

    const total = countResult[0]?.count ?? 0;

    void reply.send({
      success: true,
      data: rows.map((item) => ({
        ...item,
        availableQuantity: item.quantity - item.reservedQuantity,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  });

  // POST /reserve — reserve inventory
  app.post("/reserve", async (request, reply) => {
    const body = reserveSchema.parse(request.body);

    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, body.itemId))
      .limit(1);

    if (!item) {
      throw new NotFoundError("Inventory item not found");
    }

    const available = item.quantity - item.reservedQuantity;
    if (body.quantity > available) {
      throw new ValidationError(
        `Insufficient available stock. Available: ${available}, requested: ${body.quantity}`,
      );
    }

    const [updated] = await db
      .update(inventoryItems)
      .set({
        reservedQuantity: item.reservedQuantity + body.quantity,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, body.itemId))
      .returning();

    sendSuccess(reply, {
      ...updated,
      availableQuantity: updated!.quantity - updated!.reservedQuantity,
      reserved: body.quantity,
    });
  });

  // POST /release — release reserved inventory
  app.post("/release", async (request, reply) => {
    const body = releaseSchema.parse(request.body);

    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, body.itemId))
      .limit(1);

    if (!item) {
      throw new NotFoundError("Inventory item not found");
    }

    if (body.quantity > item.reservedQuantity) {
      throw new ValidationError(
        `Cannot release more than reserved. Reserved: ${item.reservedQuantity}, release requested: ${body.quantity}`,
      );
    }

    const [updated] = await db
      .update(inventoryItems)
      .set({
        reservedQuantity: item.reservedQuantity - body.quantity,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, body.itemId))
      .returning();

    sendSuccess(reply, {
      ...updated,
      availableQuantity: updated!.quantity - updated!.reservedQuantity,
      released: body.quantity,
    });
  });
}
