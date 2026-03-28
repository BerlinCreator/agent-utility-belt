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

describe("Rate Oracle API", () => {
  describe("POST /v1/rate-oracle/check", () => {
    it("should check rate limit headers for a URL", async () => {
      // Mock fetch to return rate limit headers
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Headers({
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": "95",
          "x-ratelimit-reset": "1700000000",
        }),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/rate-oracle/check",
        headers: { "x-api-key": "valid-test-key" },
        payload: { url: "https://api.example.com/test" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.url).toBe("https://api.example.com/test");
      expect(body.data.limit).toBe(100);
      expect(body.data.remaining).toBe(95);
      expect(body.data.status).toBe(200);

      globalThis.fetch = originalFetch;
    });

    it("should accept a known service name", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Headers({
          "x-ratelimit-limit": "5000",
          "x-ratelimit-remaining": "4999",
        }),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/rate-oracle/check",
        headers: { "x-api-key": "valid-test-key" },
        payload: { service: "openai" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.service).toBe("openai");
      expect(body.data.url).toBe("https://api.openai.com/v1/models");

      globalThis.fetch = originalFetch;
    });

    it("should reject invalid URL", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/rate-oracle/check",
        headers: { "x-api-key": "valid-test-key" },
        payload: { url: "not-a-url" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
