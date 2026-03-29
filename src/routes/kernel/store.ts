import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, like, and, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { kvStore, blobStore } from "../../db/schema.js";
import { getRedis } from "../../lib/redis.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const KV_CACHE_PREFIX = "kv:";

const kvSetSchema = z.object({
  key: z.string().min(1).max(512),
  value: z.unknown(),
  ttl: z.number().int().min(1).optional(),
});

const kvListQuerySchema = z.object({
  prefix: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function storeRoutes(app: FastifyInstance): Promise<void> {
  // ─── KV Operations ─────────────────────────────────────

  // POST /v1/store/kv — set a key-value pair
  app.post("/kv", async (request, reply) => {
    const body = kvSetSchema.parse(request.body);
    const now = new Date();
    const expiresAt = body.ttl ? new Date(now.getTime() + body.ttl * 1000) : null;

    // Upsert in Postgres
    const [result] = await db
      .insert(kvStore)
      .values({
        key: body.key,
        value: body.value,
        ttl: body.ttl ?? null,
        expiresAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: kvStore.key,
        set: {
          value: body.value,
          ttl: body.ttl ?? null,
          expiresAt,
          updatedAt: now,
        },
      })
      .returning();

    // Cache in Redis
    const redis = getRedis();
    const cacheKey = `${KV_CACHE_PREFIX}${body.key}`;
    if (body.ttl) {
      await redis.set(cacheKey, JSON.stringify(body.value), "EX", body.ttl);
    } else {
      await redis.set(cacheKey, JSON.stringify(body.value));
    }

    sendSuccess(reply, result, 201);
  });

  // GET /v1/store/kv/:key
  app.get("/kv/:key", async (request, reply) => {
    const { key } = request.params as { key: string };

    // Try Redis cache first
    const redis = getRedis();
    const cached = await redis.get(`${KV_CACHE_PREFIX}${key}`);
    if (cached !== null) {
      sendSuccess(reply, { key, value: JSON.parse(cached), source: "cache" });
      return;
    }

    // Fall back to Postgres
    const rows = await db
      .select()
      .from(kvStore)
      .where(
        and(
          eq(kvStore.key, key),
          sql`(${kvStore.expiresAt} IS NULL OR ${kvStore.expiresAt} > now())`,
        ),
      )
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Key '${key}' not found`);

    const row = rows[0]!;

    // Re-populate cache
    if (row.ttl) {
      const remainingTtl = row.expiresAt
        ? Math.max(1, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000))
        : row.ttl;
      await redis.set(`${KV_CACHE_PREFIX}${key}`, JSON.stringify(row.value), "EX", remainingTtl);
    } else {
      await redis.set(`${KV_CACHE_PREFIX}${key}`, JSON.stringify(row.value));
    }

    sendSuccess(reply, { key: row.key, value: row.value, source: "db" });
  });

  // DELETE /v1/store/kv/:key
  app.delete("/kv/:key", async (request, reply) => {
    const { key } = request.params as { key: string };

    const [deleted] = await db.delete(kvStore).where(eq(kvStore.key, key)).returning();
    if (!deleted) throw new NotFoundError(`Key '${key}' not found`);

    const redis = getRedis();
    await redis.del(`${KV_CACHE_PREFIX}${key}`);

    sendSuccess(reply, { deleted: true, key });
  });

  // GET /v1/store/kv/list
  app.get("/kv/list", async (request, reply) => {
    const query = kvListQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const conditions = [
      sql`(${kvStore.expiresAt} IS NULL OR ${kvStore.expiresAt} > now())`,
    ];
    if (query.prefix) {
      conditions.push(like(kvStore.key, `${query.prefix}%`));
    }

    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      db
        .select({ key: kvStore.key, createdAt: kvStore.createdAt, updatedAt: kvStore.updatedAt })
        .from(kvStore)
        .where(where)
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(kvStore)
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

  // ─── Blob Operations ───────────────────────────────────

  // POST /v1/store/blob — upload a blob (multipart)
  app.post("/blob", async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError("No file provided");

    const buffer = await file.toBuffer();
    const [blob] = await db
      .insert(blobStore)
      .values({
        filename: file.filename,
        contentType: file.mimetype,
        size: buffer.byteLength,
        data: buffer,
      })
      .returning({
        id: blobStore.id,
        filename: blobStore.filename,
        contentType: blobStore.contentType,
        size: blobStore.size,
        createdAt: blobStore.createdAt,
      });

    sendSuccess(reply, blob, 201);
  });

  // GET /v1/store/blob/:id
  app.get("/blob/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(blobStore)
      .where(eq(blobStore.id, id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Blob '${id}' not found`);

    const blob = rows[0]!;
    void reply
      .header("content-type", blob.contentType)
      .header("content-disposition", `attachment; filename="${blob.filename}"`)
      .header("content-length", blob.size)
      .send(blob.data);
  });

  // DELETE /v1/store/blob/:id
  app.delete("/blob/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db.delete(blobStore).where(eq(blobStore.id, id)).returning();
    if (!deleted) throw new NotFoundError(`Blob '${id}' not found`);

    sendSuccess(reply, { deleted: true, id });
  });
}
