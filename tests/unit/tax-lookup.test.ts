import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";
import { db } from "../../src/db/connection.js";

let app: FastifyInstance;

function mockValidApiKey() {
  const mockApiKey = {
    id: "test-key-id",
    userId: "test-user-id",
    key: "valid-test-key",
    tier: "free",
    isActive: true,
    callsThisMonth: 0,
    monthlyLimit: 100,
    createdAt: new Date(),
    expiresAt: null,
  };

  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([mockApiKey]),
      }),
    }),
  } as ReturnType<typeof db.select>);

  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  } as ReturnType<typeof db.update>);
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  mockValidApiKey();
});

describe("Tax Lookup API", () => {
  describe("POST /v1/tax/lookup", () => {
    it("should return UK VAT rate", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tax/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { country: "GB" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.country).toBe("GB");
      expect(body.data.taxType).toBe("VAT");
      expect(body.data.rate).toBe(20);
    });

    it("should resolve country names", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tax/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { country: "United Kingdom" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.country).toBe("GB");
    });

    it("should return US state tax", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tax/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { country: "US", state: "CA" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.state).toBe("CA");
      expect(body.data.rate).toBe(7.25);
    });

    it("should return 404 for unknown country", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tax/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { country: "XX" },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
