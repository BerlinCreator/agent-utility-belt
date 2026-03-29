import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getRedis } from "../../lib/redis.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, AppError } from "../../utils/errors.js";

const QUEUE_PREFIX = "queue:";
const JOB_PREFIX = "job:";
const PROCESSING_SUFFIX = ":processing";

const enqueueSchema = z.object({
  queue: z.string().min(1).max(255),
  payload: z.unknown(),
  priority: z.number().int().min(0).max(100).default(0),
});

const dequeueSchema = z.object({
  queue: z.string().min(1).max(255),
  timeout: z.number().int().min(0).max(300).default(0),
});

export async function queueRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/queue/enqueue
  app.post("/enqueue", async (request, reply) => {
    const body = enqueueSchema.parse(request.body);
    const redis = getRedis();
    const jobId = nanoid();
    const now = Date.now();

    const jobData = {
      id: jobId,
      queue: body.queue,
      payload: body.payload,
      priority: body.priority,
      status: "pending",
      createdAt: new Date(now).toISOString(),
      attempts: 0,
    };

    // Store job data
    await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(jobData));

    // Add to sorted set with priority as score (higher priority = lower score for earlier dequeue)
    const score = now - body.priority * 1000;
    await redis.zadd(`${QUEUE_PREFIX}${body.queue}`, score, jobId);

    sendSuccess(reply, jobData, 201);
  });

  // POST /v1/queue/dequeue
  app.post("/dequeue", async (request, reply) => {
    const body = dequeueSchema.parse(request.body);
    const redis = getRedis();
    const queueKey = `${QUEUE_PREFIX}${body.queue}`;
    const processingKey = `${QUEUE_PREFIX}${body.queue}${PROCESSING_SUFFIX}`;

    // Pop the lowest-score (highest priority) member
    const members = await redis.zpopmin(queueKey, 1);

    if (!members || members.length === 0) {
      sendSuccess(reply, { job: null, message: "Queue is empty" });
      return;
    }

    const jobId = members[0]!;
    const jobDataStr = await redis.get(`${JOB_PREFIX}${jobId}`);

    if (!jobDataStr) {
      sendSuccess(reply, { job: null, message: "Job data not found" });
      return;
    }

    const jobData = JSON.parse(jobDataStr) as Record<string, unknown>;
    jobData.status = "processing";
    jobData.attempts = (jobData.attempts as number) + 1;

    // Update job data and add to processing set
    await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(jobData));
    await redis.sadd(processingKey, jobId);

    sendSuccess(reply, jobData);
  });

  // GET /v1/queue/peek/:queue
  app.get("/peek/:queue", async (request, reply) => {
    const { queue } = request.params as { queue: string };
    const redis = getRedis();
    const queueKey = `${QUEUE_PREFIX}${queue}`;

    const members = await redis.zrange(queueKey, 0, 0);

    if (!members || members.length === 0) {
      sendSuccess(reply, { job: null, message: "Queue is empty" });
      return;
    }

    const jobId = members[0]!;
    const jobDataStr = await redis.get(`${JOB_PREFIX}${jobId}`);
    const jobData = jobDataStr ? JSON.parse(jobDataStr) : null;

    sendSuccess(reply, jobData);
  });

  // GET /v1/queue/size/:queue
  app.get("/size/:queue", async (request, reply) => {
    const { queue } = request.params as { queue: string };
    const redis = getRedis();

    const pending = await redis.zcard(`${QUEUE_PREFIX}${queue}`);
    const processing = await redis.scard(`${QUEUE_PREFIX}${queue}${PROCESSING_SUFFIX}`);

    sendSuccess(reply, { queue, pending, processing, total: pending + processing });
  });

  // POST /v1/queue/ack/:jobId
  app.post("/ack/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const redis = getRedis();

    const jobDataStr = await redis.get(`${JOB_PREFIX}${jobId}`);
    if (!jobDataStr) throw new NotFoundError(`Job '${jobId}' not found`);

    const jobData = JSON.parse(jobDataStr) as Record<string, unknown>;
    const queue = jobData.queue as string;

    // Remove from processing set
    await redis.srem(`${QUEUE_PREFIX}${queue}${PROCESSING_SUFFIX}`, jobId);

    // Mark as completed and clean up
    jobData.status = "completed";
    jobData.completedAt = new Date().toISOString();
    await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(jobData), "EX", 86400);

    sendSuccess(reply, jobData);
  });

  // POST /v1/queue/retry/:jobId
  app.post("/retry/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const redis = getRedis();

    const jobDataStr = await redis.get(`${JOB_PREFIX}${jobId}`);
    if (!jobDataStr) throw new NotFoundError(`Job '${jobId}' not found`);

    const jobData = JSON.parse(jobDataStr) as Record<string, unknown>;
    const queue = jobData.queue as string;

    if (jobData.attempts && (jobData.attempts as number) >= 5) {
      throw new AppError(400, "MAX_RETRIES", "Job has exceeded maximum retry attempts");
    }

    // Remove from processing set, re-add to queue
    await redis.srem(`${QUEUE_PREFIX}${queue}${PROCESSING_SUFFIX}`, jobId);

    jobData.status = "pending";
    await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(jobData));

    const score = Date.now() - ((jobData.priority as number) || 0) * 1000;
    await redis.zadd(`${QUEUE_PREFIX}${queue}`, score, jobId);

    sendSuccess(reply, jobData);
  });
}
