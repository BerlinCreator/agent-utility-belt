import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getRedis } from "../../lib/redis.js";
import { sendSuccess } from "../../utils/response.js";
import { AppError } from "../../utils/errors.js";

const LOCK_PREFIX = "lock:";

const acquireSchema = z.object({
  resource: z.string().min(1).max(255),
  ttl: z.number().int().min(100).max(300000).default(30000),
});

const releaseSchema = z.object({
  resource: z.string().min(1).max(255),
  lockId: z.string().min(1),
});

export async function lockRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/lock/acquire
  app.post("/acquire", async (request, reply) => {
    const body = acquireSchema.parse(request.body);
    const redis = getRedis();
    const lockId = nanoid();
    const key = `${LOCK_PREFIX}${body.resource}`;

    // SET NX PX — atomic lock acquisition
    const result = await redis.set(key, lockId, "PX", body.ttl, "NX");

    if (result !== "OK") {
      throw new AppError(409, "LOCK_HELD", `Resource '${body.resource}' is already locked`);
    }

    sendSuccess(reply, {
      lockId,
      resource: body.resource,
      ttl: body.ttl,
      acquiredAt: new Date().toISOString(),
    }, 201);
  });

  // POST /v1/lock/release
  app.post("/release", async (request, reply) => {
    const body = releaseSchema.parse(request.body);
    const redis = getRedis();
    const key = `${LOCK_PREFIX}${body.resource}`;

    // Only release if the lock is held by the same lockId (atomic via Lua)
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redis.eval(script, 1, key, body.lockId);

    if (result === 0) {
      throw new AppError(409, "LOCK_NOT_HELD", "Lock not held or already released");
    }

    sendSuccess(reply, { released: true, resource: body.resource });
  });

  // GET /v1/lock/status/:resource
  app.get("/status/:resource", async (request, reply) => {
    const { resource } = request.params as { resource: string };
    const redis = getRedis();
    const key = `${LOCK_PREFIX}${resource}`;

    const lockId = await redis.get(key);
    const ttl = lockId ? await redis.pttl(key) : -1;

    sendSuccess(reply, {
      resource,
      locked: lockId !== null,
      lockId: lockId ?? null,
      ttlMs: ttl > 0 ? ttl : null,
    });
  });
}
