import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { webhooks, webhookDeliveries } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const registerSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).default([]),
  secret: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const deliverSchema = z.object({
  webhookId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
});

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 5000, 30000];

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/webhook/register
  app.post("/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);

    const [created] = await db
      .insert(webhooks)
      .values({
        url: body.url,
        events: body.events,
        secret: body.secret,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // POST /v1/webhook/deliver
  app.post("/deliver", async (request, reply) => {
    const body = deliverSchema.parse(request.body);

    // Verify webhook exists
    const hookRows = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, body.webhookId))
      .limit(1);

    if (hookRows.length === 0) throw new NotFoundError(`Webhook '${body.webhookId}' not found`);

    const hook = hookRows[0]!;
    if (!hook.isActive) throw new NotFoundError("Webhook is inactive");

    // Create delivery record
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        webhookId: body.webhookId,
        payload: body.payload,
        status: "pending",
      })
      .returning();

    // Attempt delivery asynchronously (fire-and-forget for the response)
    attemptDelivery(delivery!.id, hook.url, body.payload, hook.secret).catch((err) => {
      app.log.error({ err, deliveryId: delivery!.id }, "Webhook delivery failed");
    });

    sendSuccess(reply, {
      deliveryId: delivery!.id,
      webhookId: body.webhookId,
      status: "pending",
    }, 202);
  });

  // GET /v1/webhook/logs/:webhookId
  app.get("/logs/:webhookId", async (request, reply) => {
    const { webhookId } = request.params as { webhookId: string };

    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(50);

    sendSuccess(reply, rows);
  });

  // DELETE /v1/webhook/:webhookId
  app.delete("/:webhookId", async (request, reply) => {
    const { webhookId } = request.params as { webhookId: string };

    const [deleted] = await db.delete(webhooks).where(eq(webhooks.id, webhookId)).returning();
    if (!deleted) throw new NotFoundError(`Webhook '${webhookId}' not found`);

    sendSuccess(reply, { deleted: true, id: webhookId });
  });
}

async function attemptDelivery(
  deliveryId: string,
  url: string,
  payload: Record<string, unknown>,
  secret: string | null,
): Promise<void> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (secret) {
        headers["x-webhook-secret"] = secret;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      await db
        .update(webhookDeliveries)
        .set({
          status: response.ok ? "success" : "failed",
          statusCode: response.status,
          response: await response.text().catch(() => ""),
          attempts: attempt + 1,
        })
        .where(eq(webhookDeliveries.id, deliveryId));

      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error";
    }

    // Wait before retry
    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }

  // All retries exhausted
  await db
    .update(webhookDeliveries)
    .set({
      status: "failed",
      response: lastError,
      attempts: MAX_RETRIES + 1,
    })
    .where(eq(webhookDeliveries.id, deliveryId));
}
