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

describe("Dispute API", () => {
  it("POST /v1/dispute/create returns 201", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "d-1", parties: ["alice", "bob"], reason: "Disagreement",
          status: "open", createdAt: new Date(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/dispute/create", headers,
      payload: { parties: ["alice", "bob"], reason: "Disagreement" },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.status).toBe("open");
  });

  it("PUT /v1/dispute/:id/status transitions open to review", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "d-1", status: "open", resolution: null }]),
        }),
      }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "d-1", status: "review" }]),
        }),
      }),
    });

    const res = await app.inject({
      method: "PUT", url: "/v1/dispute/d-1/status", headers,
      payload: { status: "review" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe("review");
  });

  it("PUT /v1/dispute/:id/status rejects invalid transition open to resolved", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "d-1", status: "open", resolution: null }]),
        }),
      }),
    });

    const res = await app.inject({
      method: "PUT", url: "/v1/dispute/d-1/status", headers,
      payload: { status: "resolved" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /v1/dispute/:id returns 404 for unknown", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/dispute/unknown", headers });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/dispute/create returns 400 for less than 2 parties", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/dispute/create", headers,
      payload: { parties: ["alice"], reason: "Solo dispute" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/dispute/create returns 401 without api-key", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/dispute/create",
      payload: { parties: ["a", "b"], reason: "test" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /v1/dispute/list returns list", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/dispute/list", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it("POST /v1/dispute/create returns 400 for missing reason", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/dispute/create", headers,
      payload: { parties: ["a", "b"] },
    });
    expect(res.statusCode).toBe(400);
  });
});
