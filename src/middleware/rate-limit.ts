import type { FastifyRequest, FastifyReply } from "fastify";
import IORedis from "ioredis";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { apiKeys } from "../db/schema.js";
import { env } from "../config/env.js";
import { RateLimitError } from "../utils/errors.js";

const Redis = IORedis.default ?? IORedis;

let redis: InstanceType<typeof Redis> | null = null;

function getRedis(): InstanceType<typeof Redis> {
  if (!redis) {
    const isTls = env.REDIS_URL.startsWith("rediss://");
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      // Railway managed Redis uses rediss:// (TLS). ioredis needs explicit tls option.
      ...(isTls && { tls: { rejectUnauthorized: false } }),
    });
  }
  return redis;
}

function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function usageRateLimitMiddleware(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const apiKeyId = request.apiKeyId;
  if (!apiKeyId) return;

  const [apiKeyRecord] = await db
    .select({ monthlyLimit: apiKeys.monthlyLimit })
    .from(apiKeys)
    .where(eq(apiKeys.id, apiKeyId))
    .limit(1);

  if (!apiKeyRecord) return;

  const yearMonth = getCurrentYearMonth();
  const redisKey = `ratelimit:${apiKeyId}:${yearMonth}`;

  const client = getRedis();
  const currentCount = await client.incr(redisKey);

  // Set expiry on first increment (32 days covers any month)
  if (currentCount === 1) {
    await client.expire(redisKey, 32 * 86400);
  }

  if (currentCount > apiKeyRecord.monthlyLimit) {
    throw new RateLimitError(
      `Monthly limit of ${apiKeyRecord.monthlyLimit} calls exceeded. Upgrade your plan for more.`,
    );
  }
}
