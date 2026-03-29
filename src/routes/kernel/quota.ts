import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRedis } from "../../lib/redis.js";
import { sendSuccess } from "../../utils/response.js";
import { AppError } from "../../utils/errors.js";

const QUOTA_PREFIX = "quota:";

const checkSchema = z.object({
  key: z.string().min(1).max(255),
  limit: z.number().int().min(1),
  windowMs: z.number().int().min(1000).max(86400000),
});

const consumeSchema = z.object({
  key: z.string().min(1).max(255),
  cost: z.number().int().min(1).default(1),
  limit: z.number().int().min(1),
  windowMs: z.number().int().min(1000).max(86400000),
});

export async function quotaRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/quota/check — check if under limit (does not consume)
  app.post("/check", async (request, reply) => {
    const body = checkSchema.parse(request.body);
    const redis = getRedis();
    const now = Date.now();
    const windowStart = now - body.windowMs;
    const key = `${QUOTA_PREFIX}${body.key}`;

    // Remove expired entries
    await redis.zremrangebyscore(key, 0, windowStart);

    const current = await redis.zcard(key);
    const remaining = Math.max(0, body.limit - current);

    sendSuccess(reply, {
      key: body.key,
      allowed: current < body.limit,
      current,
      limit: body.limit,
      remaining,
      windowMs: body.windowMs,
    });
  });

  // POST /v1/quota/consume — consume quota
  app.post("/consume", async (request, reply) => {
    const body = consumeSchema.parse(request.body);
    const redis = getRedis();
    const now = Date.now();
    const windowStart = now - body.windowMs;
    const key = `${QUOTA_PREFIX}${body.key}`;

    // Sliding window using sorted set
    await redis.zremrangebyscore(key, 0, windowStart);

    const current = await redis.zcard(key);

    if (current + body.cost > body.limit) {
      throw new AppError(429, "QUOTA_EXCEEDED", `Quota exceeded for '${body.key}': ${current}/${body.limit}`);
    }

    // Add entries for the cost
    const pipeline = redis.pipeline();
    for (let i = 0; i < body.cost; i++) {
      pipeline.zadd(key, now + i, `${now}-${i}`);
    }
    pipeline.expire(key, Math.ceil(body.windowMs / 1000));
    await pipeline.exec();

    const newCount = current + body.cost;
    const remaining = Math.max(0, body.limit - newCount);

    sendSuccess(reply, {
      key: body.key,
      consumed: body.cost,
      current: newCount,
      limit: body.limit,
      remaining,
      windowMs: body.windowMs,
    });
  });

  // GET /v1/quota/status/:key
  app.get("/status/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    const redis = getRedis();
    const redisKey = `${QUOTA_PREFIX}${key}`;

    const count = await redis.zcard(redisKey);
    const ttl = await redis.ttl(redisKey);

    sendSuccess(reply, {
      key,
      current: count,
      ttlSeconds: ttl > 0 ? ttl : null,
    });
  });
}
