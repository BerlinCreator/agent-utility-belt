import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Coupon API", () => {
  it("POST /v1/coupon/create returns 201 with valid coupon", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "coupon-1", code: "SAVE20", type: "percentage", value: "20.00",
          minPurchase: null, maxUses: null, usedCount: 0,
          expiresAt: null, isActive: true, metadata: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/coupon/create", headers,
      payload: { code: "SAVE20", type: "percentage", value: 20 },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.code).toBe("SAVE20");
  });

  it("POST /v1/coupon/create rejects percentage > 100", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/coupon/create", headers,
      payload: { code: "BADCOUPON", type: "percentage", value: 150 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/coupon/validate returns valid discount calculation", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "coupon-1", code: "SAVE20", type: "percentage", value: "20.00",
            minPurchase: null, maxUses: null, usedCount: 0,
            expiresAt: null, isActive: true,
          }]),
        }),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/coupon/validate", headers,
      payload: { code: "SAVE20", purchaseAmount: 100 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.valid).toBe(true);
    expect(body.data.discount).toBe("20.00");
    expect(body.data.finalAmount).toBe("80.00");
  });

  it("POST /v1/coupon/validate returns error for expired coupon", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "coupon-2", code: "EXPIRED10", type: "percentage", value: "10.00",
            minPurchase: null, maxUses: null, usedCount: 0,
            expiresAt: new Date("2020-01-01"), isActive: true,
          }]),
        }),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/coupon/validate", headers,
      payload: { code: "EXPIRED10", purchaseAmount: 100 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /v1/coupon/:id returns coupon", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "d290f1ee-6c54-4b01-90e6-d701748f0851", code: "SAVE20",
            type: "percentage", value: "20.00", isActive: true,
            createdAt: new Date().toISOString(),
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/coupon/d290f1ee-6c54-4b01-90e6-d701748f0851", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.code).toBe("SAVE20");
  });

  it("PUT /v1/coupon/:id updates coupon", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "d290f1ee-6c54-4b01-90e6-d701748f0851", code: "SAVE20",
            type: "percentage", value: "30.00", isActive: true,
            updatedAt: new Date().toISOString(),
          }]),
        }),
      }),
    });

    const res = await app.inject({
      method: "PUT", url: "/v1/coupon/d290f1ee-6c54-4b01-90e6-d701748f0851", headers,
      payload: { value: 30 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.value).toBe("30.00");
  });

  it("DELETE /v1/coupon/:id deletes coupon", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "d290f1ee-6c54-4b01-90e6-d701748f0851", code: "SAVE20",
        }]),
      }),
    });

    const res = await app.inject({ method: "DELETE", url: "/v1/coupon/d290f1ee-6c54-4b01-90e6-d701748f0851", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.deleted).toBe(true);
  });
});
