import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";
import { db } from "../../src/db/connection.js";

let app: FastifyInstance;

function mockValidApiKey() {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{
          id: "test-key-id",
          userId: "test-user-id",
          key: "valid-test-key",
          tier: "free",
          isActive: true,
          callsThisMonth: 0,
          monthlyLimit: 100,
          createdAt: new Date(),
          expiresAt: null,
        }]),
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

describe("Web Extract API", () => {
  describe("POST /v1/extract/extract", () => {
    it("should require auth header", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/extract/extract",
        payload: { url: "https://example.com" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should validate url field is required", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/extract/extract",
        headers: { "x-api-key": "valid-test-key" },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should validate url format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/extract/extract",
        headers: { "x-api-key": "valid-test-key" },
        payload: { url: "not-a-url" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should accept valid format options", async () => {
      // Mock global fetch
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html><head><title>Test Page</title><meta name=\"description\" content=\"A test\"></head><body><p>Hello</p></body></html>"),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/extract/extract",
        headers: { "x-api-key": "valid-test-key" },
        payload: { url: "https://example.com", format: "text" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.title).toBe("Test Page");
      expect(body.data.description).toBe("A test");

      globalThis.fetch = originalFetch;
    });
  });
});
