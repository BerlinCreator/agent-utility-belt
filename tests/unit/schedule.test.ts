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
});
