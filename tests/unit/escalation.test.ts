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

describe("Escalation API", () => {
  it("POST /v1/escalation/create returns 201", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "e-1", level: "medium", context: "Issue found", status: "open",
          createdAt: new Date(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/escalation/create", headers,
      payload: { level: "medium", context: "Issue found" },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.level).toBe("medium");
  });

  it("PUT /v1/escalation/:id/escalate bumps level", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "e-1", level: "medium", status: "open" }]),
        }),
      }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "e-1", level: "high", status: "escalated" }]),
        }),
      }),
    });

    const res = await app.inject({ method: "PUT", url: "/v1/escalation/e-1/escalate", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.level).toBe("high");
  });

  it("PUT /v1/escalation/:id/resolve resolves", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "e-1", level: "high", status: "escalated" }]),
        }),
      }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "e-1", status: "resolved" }]),
        }),
      }),
    });

    const res = await app.inject({ method: "PUT", url: "/v1/escalation/e-1/resolve", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe("resolved");
  });

  it("GET /v1/escalation/:id returns 404 for unknown", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/escalation/unknown", headers });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/escalation/create returns 400 for invalid level", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/escalation/create", headers,
      payload: { level: "extreme", context: "bad" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/escalation/create returns 401 without api-key", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/escalation/create",
      payload: { level: "low", context: "test" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /v1/escalation/list returns list", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/escalation/list", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it("POST /v1/escalation/create returns 400 for missing context", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/escalation/create", headers,
      payload: { level: "low" },
    });
    expect(res.statusCode).toBe(400);
  });
});
