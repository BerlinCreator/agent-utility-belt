import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Feedback API", () => {
  it("POST /v1/feedback/submit returns 201", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "fb-1", entityId: "product-99", rating: 5, comment: "Excellent!",
          tags: ["great"], metadata: null, createdAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/feedback/submit", headers,
      payload: { entityId: "product-99", rating: 5, comment: "Excellent!", tags: ["great"] },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.entityId).toBe("product-99");
    expect(body.data.rating).toBe(5);
  });

  it("GET /v1/feedback/aggregate/:entityId returns aggregate stats", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: "fb-1", entityId: "product-99", rating: 5, comment: "Great" },
          { id: "fb-2", entityId: "product-99", rating: 3, comment: "OK" },
        ]),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/feedback/aggregate/product-99", headers });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.count).toBe(2);
    expect(body.data.averageRating).toBe(4);
    expect(body.data.distribution[5]).toBe(1);
    expect(body.data.distribution[3]).toBe(1);
  });

  it("GET /v1/feedback/aggregate/:entityId returns 404 for unknown entity", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/feedback/aggregate/unknown-entity", headers });
    expect(res.statusCode).toBe(404);
  });

  it("GET /v1/feedback/list returns list", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([
          { id: "fb-1", entityId: "product-99", rating: 5 },
          { id: "fb-2", entityId: "product-100", rating: 4 },
        ]),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/feedback/list", headers });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.feedbacks).toHaveLength(2);
    expect(body.data.count).toBe(2);
  });

  it("POST /v1/feedback/submit with invalid rating returns 400", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/feedback/submit", headers,
      payload: { entityId: "product-99", rating: 10 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/feedback/submit with missing entityId returns 400", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/feedback/submit", headers,
      payload: { rating: 4 },
    });
    expect(res.statusCode).toBe(400);
  });
});
