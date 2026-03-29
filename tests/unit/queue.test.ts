import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Queue API", () => {
  it("POST /v1/queue/enqueue adds a job", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/queue/enqueue", headers, payload: { queue: "tasks", payload: { type: "email" } } });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.queue).toBe("tasks");
    expect(body.data.id).toBeDefined();
    expect(body.data.status).toBe("pending");
  });

  it("POST /v1/queue/dequeue returns null when empty", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/queue/dequeue", headers, payload: { queue: "tasks" } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.job).toBeNull();
  });

  it("GET /v1/queue/size/:queue returns size", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/queue/size/tasks", headers });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.queue).toBe("tasks");
    expect(typeof body.data.pending).toBe("number");
  });

  it("GET /v1/queue/peek/:queue returns null when empty", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/queue/peek/tasks", headers });
    expect(res.statusCode).toBe(200);
  });

  it("POST /v1/queue/enqueue returns 400 for missing queue", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/queue/enqueue", headers, payload: { payload: { type: "email" } } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/queue/enqueue returns 400 for wrong type queue", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/queue/enqueue", headers, payload: { queue: 123, payload: { type: "email" } } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/queue/enqueue returns 401 without api-key", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/queue/enqueue", payload: { queue: "tasks", payload: { type: "email" } } });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/queue/enqueue returns 401 with invalid api-key", async () => {
    const { getSupabaseAdmin } = await import("../../src/lib/supabase.js");
    const mockGetSupabase = getSupabaseAdmin as ReturnType<typeof vi.fn>;
    mockGetSupabase.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/queue/enqueue", headers: { "x-api-key": "invalid-key" }, payload: { queue: "tasks", payload: { type: "email" } } });
    expect(res.statusCode).toBe(401);
  });

  it("success response has correct format", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/queue/enqueue", headers, payload: { queue: "emails", payload: { to: "test@example.com" } } });
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("id");
    expect(body.data).toHaveProperty("queue");
    expect(body.data).toHaveProperty("status");
  });

  it("POST /v1/queue/ack/:jobId returns 404 for missing job", async () => {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis();
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await app.inject({ method: "POST", url: "/v1/queue/ack/nonexistent-job", headers });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/queue/retry/:jobId returns 404 for missing job", async () => {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis();
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await app.inject({ method: "POST", url: "/v1/queue/retry/nonexistent-job", headers });
    expect(res.statusCode).toBe(404);
  });
});
