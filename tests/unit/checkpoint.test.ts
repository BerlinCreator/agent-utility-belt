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
});
