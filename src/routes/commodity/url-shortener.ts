import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { shortUrls } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const createSchema = z.object({
  url: z.string().url().max(2048),
  customCode: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  expiresIn: z.coerce.number().int().min(1).max(365).optional(), // days
});

const lookupSchema = z.object({
  code: z.string().min(1).max(20),
});

export async function urlShortenerRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/url/shorten
  app.post("/shorten", async (request, reply) => {
    const params = createSchema.parse(request.body);
    const apiKeyId = request.apiKeyId!;

    const shortCode = params.customCode ?? nanoid(8);

    const expiresAt = params.expiresIn
      ? new Date(Date.now() + params.expiresIn * 86400000)
      : null;

    const [record] = await db.insert(shortUrls).values({
      apiKeyId,
      shortCode,
      originalUrl: params.url,
      expiresAt,
    }).returning();

    sendSuccess(reply, {
      shortCode: record!.shortCode,
      originalUrl: record!.originalUrl,
      shortUrl: `${request.protocol}://${request.hostname}/r/${record!.shortCode}`,
      expiresAt: record!.expiresAt?.toISOString() ?? null,
      createdAt: record!.createdAt.toISOString(),
    }, 201);
  });

  // GET /v1/url/stats/:code
  app.get("/stats/:code", async (request, reply) => {
    const { code } = lookupSchema.parse(request.params);

    const [record] = await db
      .select()
      .from(shortUrls)
      .where(eq(shortUrls.shortCode, code))
      .limit(1);

    if (!record) throw new NotFoundError("Short URL not found");

    sendSuccess(reply, {
      shortCode: record.shortCode,
      originalUrl: record.originalUrl,
      clicks: record.clicks,
      isActive: record.isActive,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    });
  });

  // DELETE /v1/url/:code
  app.delete("/:code", async (request, reply) => {
    const { code } = lookupSchema.parse(request.params);

    const [record] = await db
      .update(shortUrls)
      .set({ isActive: false })
      .where(eq(shortUrls.shortCode, code))
      .returning();

    if (!record) throw new NotFoundError("Short URL not found");

    sendSuccess(reply, { deleted: true, shortCode: code });
  });
}

// Public redirect route (registered separately outside protected context)
export async function urlRedirectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/r/:code", async (request, reply) => {
    const { code } = z.object({ code: z.string().min(1) }).parse(request.params);

    const [record] = await db
      .select()
      .from(shortUrls)
      .where(eq(shortUrls.shortCode, code))
      .limit(1);

    if (!record || !record.isActive) {
      void reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Short URL not found" } });
      return;
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
      void reply.code(410).send({ success: false, error: { code: "EXPIRED", message: "This short URL has expired" } });
      return;
    }

    // Increment clicks
    await db
      .update(shortUrls)
      .set({ clicks: sql`${shortUrls.clicks} + 1` })
      .where(eq(shortUrls.id, record.id));

    void reply.redirect(record.originalUrl);
  });
}
