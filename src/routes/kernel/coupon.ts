import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { coupons } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const createSchema = z.object({
  code: z.string().min(1).max(50).transform((s) => s.toUpperCase()),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().positive(),
  minPurchase: z.number().nonnegative().optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z.object({
  value: z.number().positive().optional(),
  minPurchase: z.number().nonnegative().optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const validateSchema = z.object({
  code: z.string().min(1).transform((s) => s.toUpperCase()),
  purchaseAmount: z.number().positive(),
});

export async function couponRoutes(app: FastifyInstance): Promise<void> {
  // POST /create — create a new coupon
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);

    if (body.type === "percentage" && body.value > 100) {
      throw new ValidationError("Percentage discount cannot exceed 100%");
    }

    const [coupon] = await db
      .insert(coupons)
      .values({
        code: body.code,
        type: body.type,
        value: body.value.toFixed(2),
        minPurchase: body.minPurchase?.toFixed(2),
        maxUses: body.maxUses,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, coupon, 201);
  });

  // POST /validate — validate and calculate discount for a coupon
  app.post("/validate", async (request, reply) => {
    const body = validateSchema.parse(request.body);

    const [coupon] = await db
      .select()
      .from(coupons)
      .where(eq(coupons.code, body.code))
      .limit(1);

    if (!coupon) {
      throw new NotFoundError("Coupon not found");
    }

    if (!coupon.isActive) {
      throw new ValidationError("Coupon is inactive");
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      throw new ValidationError("Coupon has expired");
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new ValidationError("Coupon usage limit reached");
    }

    if (coupon.minPurchase !== null && body.purchaseAmount < parseFloat(coupon.minPurchase)) {
      throw new ValidationError(
        `Minimum purchase amount of ${coupon.minPurchase} not met`,
      );
    }

    const discount =
      coupon.type === "percentage"
        ? body.purchaseAmount * (parseFloat(coupon.value) / 100)
        : Math.min(parseFloat(coupon.value), body.purchaseAmount);

    const finalAmount = body.purchaseAmount - discount;

    sendSuccess(reply, {
      valid: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
      },
      discount: discount.toFixed(2),
      originalAmount: body.purchaseAmount.toFixed(2),
      finalAmount: finalAmount.toFixed(2),
    });
  });

  // GET /:id — get coupon by id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [coupon] = await db
      .select()
      .from(coupons)
      .where(eq(coupons.id, id))
      .limit(1);

    if (!coupon) {
      throw new NotFoundError("Coupon not found");
    }

    sendSuccess(reply, coupon);
  });

  // PUT /:id — update a coupon
  app.put("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateSchema.parse(request.body);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.value !== undefined) updateData.value = body.value.toFixed(2);
    if (body.minPurchase !== undefined) updateData.minPurchase = body.minPurchase.toFixed(2);
    if (body.maxUses !== undefined) updateData.maxUses = body.maxUses;
    if (body.expiresAt !== undefined) updateData.expiresAt = new Date(body.expiresAt);
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    const [updated] = await db
      .update(coupons)
      .set(updateData)
      .where(eq(coupons.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError("Coupon not found");
    }

    sendSuccess(reply, updated);
  });

  // DELETE /:id — delete a coupon
  app.delete("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [deleted] = await db
      .delete(coupons)
      .where(eq(coupons.id, id))
      .returning();

    if (!deleted) {
      throw new NotFoundError("Coupon not found");
    }

    sendSuccess(reply, { deleted: true, id });
  });
}
