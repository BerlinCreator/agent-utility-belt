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

describe("Handoff API", () => {
  it("POST /v1/handoff/create returns 201", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "h-1", fromAgent: "agent-a", toAgent: "agent-b",
          task: "Process data", status: "pending", createdAt: new Date(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/handoff/create", headers,
      payload: { fromAgent: "agent-a", toAgent: "agent-b", task: "Process data" },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.status).toBe("pending");
  });

  it("GET /v1/handoff/:id returns handoff", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "h-1", fromAgent: "agent-a", toAgent: "agent-b",
            task: "Process data", status: "pending",
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/handoff/h-1", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe("h-1");
  });

  it("PUT /v1/handoff/:id/accept accepts pending handoff", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "h-1", status: "pending" }]),
        }),
      }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "h-1", status: "accepted" }]),
        }),
      }),
    });

    const res = await app.inject({ method: "PUT", url: "/v1/handoff/h-1/accept", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe("accepted");
  });

  it("PUT /v1/handoff/:id/reject rejects pending handoff", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "h-1", status: "pending" }]),
        }),
      }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "h-1", status: "rejected" }]),
        }),
      }),
    });

    const res = await app.inject({ method: "PUT", url: "/v1/handoff/h-1/reject", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe("rejected");
  });

  it("GET /v1/handoff/:id returns 404 for unknown handoff", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/handoff/unknown", headers });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/handoff/create returns 400 for missing fields", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/handoff/create", headers,
      payload: { fromAgent: "agent-a" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/handoff/create returns 401 without api-key", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/handoff/create",
      payload: { fromAgent: "a", toAgent: "b", task: "t" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /v1/handoff/list returns list", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/handoff/list", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });
});
