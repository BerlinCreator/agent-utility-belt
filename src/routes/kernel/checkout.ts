import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getRedis } from "../../lib/redis.js";
import { db } from "../../db/connection.js";
import { invoices, coupons, ledgerAccounts, ledgerEntries } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const CART_PREFIX = "cart:";

interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  metadata?: Record<string, unknown>;
}

interface Cart {
  id: string;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
}

const processSchema = z.object({
  cartId: z.string().min(1),
  couponCode: z.string().optional(),
  from: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    address: z.string().optional(),
  }),
  to: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    address: z.string().optional(),
  }),
  taxRate: z.number().min(0).max(100).default(0),
  currency: z.string().length(3).default("USD"),
  revenueAccountId: z.string().uuid().optional(),
  receivableAccountId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  // POST /process — orchestrate Cart → Coupon → Invoice → Ledger
  app.post("/process", async (request, reply) => {
    const body = processSchema.parse(request.body);

    // Step 1: Load cart from Redis
    const redis = getRedis();
    const cartData = await redis.get(`${CART_PREFIX}${body.cartId}`);
    if (!cartData) {
      throw new NotFoundError("Cart not found");
    }

    const cart = JSON.parse(cartData) as Cart;
    if (cart.items.length === 0) {
      throw new ValidationError("Cart is empty");
    }

    // Step 2: Calculate subtotal
    let subtotal = cart.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    // Step 3: Apply coupon if provided
    let discount = 0;
    let couponDetails = null;

    if (body.couponCode) {
      const [coupon] = await db
        .select()
        .from(coupons)
        .where(eq(coupons.code, body.couponCode.toUpperCase()))
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

      if (coupon.minPurchase !== null && subtotal < parseFloat(coupon.minPurchase)) {
        throw new ValidationError(
          `Minimum purchase of ${coupon.minPurchase} not met`,
        );
      }

      discount =
        coupon.type === "percentage"
          ? subtotal * (parseFloat(coupon.value) / 100)
          : Math.min(parseFloat(coupon.value), subtotal);

      couponDetails = { code: coupon.code, type: coupon.type, value: coupon.value, discount: discount.toFixed(2) };

      // Increment coupon usage
      await db
        .update(coupons)
        .set({ usedCount: coupon.usedCount + 1, updatedAt: new Date() })
        .where(eq(coupons.id, coupon.id));
    }

    const discountedSubtotal = subtotal - discount;

    // Step 4: Calculate tax and total
    const taxAmount = discountedSubtotal * (body.taxRate / 100);
    const total = discountedSubtotal + taxAmount;
    const invoiceNumber = `INV-${nanoid(10).toUpperCase()}`;

    // Step 5: Create invoice
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        from: body.from,
        to: body.to,
        items: cart.items,
        subtotal: discountedSubtotal.toFixed(2),
        taxRate: body.taxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        currency: body.currency,
        status: "sent",
        metadata: { ...body.metadata, cartId: body.cartId, coupon: couponDetails },
      })
      .returning();

    // Step 6: Create ledger entries if account IDs provided
    let ledgerTransaction = null;
    if (body.receivableAccountId && body.revenueAccountId) {
      const transactionId = `TXN-${nanoid(12)}`;

      const [debitEntry] = await db
        .insert(ledgerEntries)
        .values({
          transactionId,
          accountId: body.receivableAccountId,
          type: "debit",
          amount: total.toFixed(2),
          description: `Checkout ${invoiceNumber}`,
        })
        .returning();

      const [creditEntry] = await db
        .insert(ledgerEntries)
        .values({
          transactionId,
          accountId: body.revenueAccountId,
          type: "credit",
          amount: total.toFixed(2),
          description: `Checkout ${invoiceNumber}`,
        })
        .returning();

      ledgerTransaction = { transactionId, entries: [debitEntry, creditEntry] };
    }

    // Step 7: Clear cart
    await redis.del(`${CART_PREFIX}${body.cartId}`);

    sendSuccess(
      reply,
      {
        invoice,
        coupon: couponDetails,
        ledger: ledgerTransaction,
        summary: {
          originalSubtotal: subtotal.toFixed(2),
          discount: discount.toFixed(2),
          subtotal: discountedSubtotal.toFixed(2),
          tax: taxAmount.toFixed(2),
          total: total.toFixed(2),
        },
      },
      201,
    );
  });
}
