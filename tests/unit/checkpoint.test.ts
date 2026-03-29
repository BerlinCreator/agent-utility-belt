import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Checkpoint API", () => {
  it("POST /v1/checkpoint/save creates a checkpoint", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ maxVersion: 0 }]) }),
    });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "cp-1", agentId: "agent-1", state: { step: 5 }, metadata: null, version: 1, createdAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/checkpoint/save", headers, payload: { agentId: "agent-1", state: { step: 5 } } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.agentId).toBe("agent-1");
  });

  it("GET /v1/checkpoint/latest/:agentId returns latest", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "cp-1", version: 3 }]) }),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/checkpoint/latest/agent-1", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.version).toBe(3);
  });

  it("GET /v1/checkpoint/latest/:agentId returns 404", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/checkpoint/latest/none", headers });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/checkpoint/save returns 400 for missing agentId", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/checkpoint/save", headers, payload: { state: { step: 5 } } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/checkpoint/save returns 400 for missing state", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/checkpoint/save", headers, payload: { agentId: "agent-1" } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/checkpoint/save returns 400 for wrong type agentId", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/checkpoint/save", headers, payload: { agentId: 123, state: { step: 5 } } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/checkpoint/save returns 401 without api-key", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/checkpoint/save", payload: { agentId: "agent-1", state: { step: 5 } } });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/checkpoint/save returns 401 with invalid api-key", async () => {
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

    const res = await app.inject({ method: "POST", url: "/v1/checkpoint/save", headers: { "x-api-key": "invalid-key" }, payload: { agentId: "agent-1", state: { step: 5 } } });
    expect(res.statusCode).toBe(401);
  });

  it("success response has correct format", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ maxVersion: 2 }]) }),
    });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "cp-2", agentId: "agent-2", state: { step: 10 }, metadata: null, version: 3, createdAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/checkpoint/save", headers, payload: { agentId: "agent-2", state: { step: 10 } } });
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("id");
    expect(body.data).toHaveProperty("version");
  });

  it("GET /v1/checkpoint/:checkpointId returns 404 for missing", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/checkpoint/nonexistent-id", headers });
    expect(res.statusCode).toBe(404);
  });
});
