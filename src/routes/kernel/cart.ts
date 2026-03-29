import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getRedis } from "../../lib/redis.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const CART_PREFIX = "cart:";
const CART_TTL = 86400; // 24 hours

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

const addItemSchema = z.object({
  name: z.string().min(1).max(255),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateItemSchema = z.object({
  quantity: z.number().int().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function getCart(cartId: string): Promise<Cart | null> {
  const redis = getRedis();
  const data = await redis.get(`${CART_PREFIX}${cartId}`);
  if (!data) return null;
  return JSON.parse(data) as Cart;
}

async function saveCart(cart: Cart): Promise<void> {
  const redis = getRedis();
  await redis.set(`${CART_PREFIX}${cart.id}`, JSON.stringify(cart), "EX", CART_TTL);
}

export async function cartRoutes(app: FastifyInstance): Promise<void> {
  // POST /create — create a new cart
  app.post("/create", async (_request, reply) => {
    const cart: Cart = {
      id: nanoid(12),
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveCart(cart);
    sendSuccess(reply, cart, 201);
  });

  // POST /:id/item — add an item to the cart
  app.post("/:id/item", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = addItemSchema.parse(request.body);

    const cart = await getCart(id);
    if (!cart) {
      throw new NotFoundError("Cart not found");
    }

    const item: CartItem = {
      itemId: nanoid(8),
      name: body.name,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      metadata: body.metadata,
    };

    cart.items.push(item);
    cart.updatedAt = new Date().toISOString();
    await saveCart(cart);

    sendSuccess(reply, { cart, addedItem: item }, 201);
  });

  // PUT /:id/item/:itemId — update an item in the cart
  app.put("/:id/item/:itemId", async (request, reply) => {
    const { id, itemId } = z
      .object({ id: z.string().min(1), itemId: z.string().min(1) })
      .parse(request.params);
    const body = updateItemSchema.parse(request.body);

    const cart = await getCart(id);
    if (!cart) {
      throw new NotFoundError("Cart not found");
    }

    const itemIndex = cart.items.findIndex((i) => i.itemId === itemId);
    if (itemIndex === -1) {
      throw new NotFoundError("Item not found in cart");
    }

    const item = cart.items[itemIndex]!;
    if (body.quantity !== undefined) item.quantity = body.quantity;
    if (body.unitPrice !== undefined) item.unitPrice = body.unitPrice;
    if (body.metadata !== undefined) item.metadata = body.metadata;

    cart.updatedAt = new Date().toISOString();
    await saveCart(cart);

    sendSuccess(reply, cart);
  });

  // DELETE /:id/item/:itemId — remove an item from the cart
  app.delete("/:id/item/:itemId", async (request, reply) => {
    const { id, itemId } = z
      .object({ id: z.string().min(1), itemId: z.string().min(1) })
      .parse(request.params);

    const cart = await getCart(id);
    if (!cart) {
      throw new NotFoundError("Cart not found");
    }

    const initialLength = cart.items.length;
    cart.items = cart.items.filter((i) => i.itemId !== itemId);

    if (cart.items.length === initialLength) {
      throw new NotFoundError("Item not found in cart");
    }

    cart.updatedAt = new Date().toISOString();
    await saveCart(cart);

    sendSuccess(reply, cart);
  });

  // GET /:id — get full cart with totals
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);

    const cart = await getCart(id);
    if (!cart) {
      throw new NotFoundError("Cart not found");
    }

    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    sendSuccess(reply, {
      ...cart,
      itemCount: cart.items.length,
      subtotal: subtotal.toFixed(2),
    });
  });
}
