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
});
