import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Schedule API", () => {
  it("POST /v1/schedule/create creates a schedule", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "sched-1", name: "daily-report", cronExpression: "0 9 * * *",
          callbackUrl: "https://example.com/report", payload: null, status: "active",
          lastRunAt: null, nextRunAt: new Date().toISOString(), metadata: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/schedule/create", headers,
      payload: { name: "daily-report", cronExpression: "0 9 * * *", callbackUrl: "https://example.com/report" },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.cronExpression).toBe("0 9 * * *");
  });

  it("POST /v1/schedule/create rejects invalid cron", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/schedule/create", headers,
      payload: { name: "bad", cronExpression: "not-a-cron", callbackUrl: "https://example.com/report" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /v1/schedule/:id returns 404 for nonexistent", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/schedule/nonexistent-id", headers });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/schedule/pause/:id returns 404 for nonexistent", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/schedule/pause/nonexistent-id", headers });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/schedule/create returns 400 for missing cronExpression", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/schedule/create", headers,
      payload: { name: "test", callbackUrl: "https://example.com/report" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/schedule/create returns 400 for missing callbackUrl", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/schedule/create", headers,
      payload: { name: "test", cronExpression: "0 9 * * *" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/schedule/create returns 400 for invalid callbackUrl", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/schedule/create", headers,
      payload: { name: "test", cronExpression: "0 9 * * *", callbackUrl: "not-a-url" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/schedule/create returns 401 without api-key", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/schedule/create",
      payload: { name: "daily-report", cronExpression: "0 9 * * *", callbackUrl: "https://example.com/report" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/schedule/create returns 401 with invalid api-key", async () => {
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

    const res = await app.inject({
      method: "POST", url: "/v1/schedule/create", headers: { "x-api-key": "invalid-key" },
      payload: { name: "daily-report", cronExpression: "0 9 * * *", callbackUrl: "https://example.com/report" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("success response has correct format", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "sched-2", name: "weekly-cleanup", cronExpression: "0 0 * * 0",
          callbackUrl: "https://example.com/cleanup", payload: null, status: "active",
          lastRunAt: null, nextRunAt: new Date().toISOString(), metadata: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/schedule/create", headers,
      payload: { name: "weekly-cleanup", cronExpression: "0 0 * * 0", callbackUrl: "https://example.com/cleanup" },
    });
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("id");
    expect(body.data).toHaveProperty("cronExpression");
  });

  it("DELETE /v1/schedule/:id returns 404 for missing", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    });

    const res = await app.inject({ method: "DELETE", url: "/v1/schedule/nonexistent-id", headers });
    expect(res.statusCode).toBe(404);
  });
});
