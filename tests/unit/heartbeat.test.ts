import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => { await app.close(); });

describe("Heartbeat API", () => {
  it("POST /v1/heartbeat/register returns 201", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "abc-123", agentId: "agent-1", name: "Test Agent",
          lastPing: new Date(), staleThresholdMs: 30000, deadThresholdMs: 120000,
          metadata: null, createdAt: new Date(),
        }]),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/heartbeat/register", headers, payload: { agentId: "agent-1", name: "Test Agent" } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.agentId).toBe("agent-1");
  });

  it("GET /v1/heartbeat/check/:id returns alive status", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            agentId: "agent-1", lastPing: new Date(), staleThresholdMs: 30000, deadThresholdMs: 120000,
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/heartbeat/check/agent-1", headers });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe("alive");
  });

  it("GET /v1/heartbeat/check/:id returns 404 for unknown agent", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/heartbeat/check/unknown", headers });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/heartbeat/register returns 400 for missing agentId", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/heartbeat/register", headers, payload: { name: "Test Agent" } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/heartbeat/register returns 400 for wrong type agentId", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/heartbeat/register", headers, payload: { agentId: 12345 } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/heartbeat/register returns 401 without api-key", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/heartbeat/register", payload: { agentId: "agent-1" } });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/heartbeat/register returns 401 with invalid api-key", async () => {
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

    const res = await app.inject({ method: "POST", url: "/v1/heartbeat/register", headers: { "x-api-key": "invalid-key" }, payload: { agentId: "agent-1" } });
    expect(res.statusCode).toBe(401);
  });

  it("success response has correct format", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            agentId: "agent-1", lastPing: new Date(), staleThresholdMs: 30000, deadThresholdMs: 120000,
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/heartbeat/check/agent-1", headers });
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("agentId");
    expect(body.data).toHaveProperty("status");
  });

  it("GET /v1/heartbeat/status/:id returns full status with elapsedMs", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            agentId: "agent-1", lastPing: new Date(), staleThresholdMs: 30000, deadThresholdMs: 120000,
            name: "Test Agent", metadata: null, createdAt: new Date(),
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/heartbeat/status/agent-1", headers });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveProperty("elapsedMs");
    expect(typeof body.data.elapsedMs).toBe("number");
  });
});
