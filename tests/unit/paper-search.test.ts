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

describe("Paper Search API", () => {
  describe("POST /v1/papers/search", () => {
    it("should search for papers", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          total: 2,
          data: [
            {
              paperId: "abc123",
              title: "Test Paper",
              abstract: "An abstract",
              year: 2024,
              citationCount: 42,
              url: "https://example.com/paper",
              authors: [{ name: "John Doe" }],
            },
          ],
        }),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/papers/search",
        headers: { "x-api-key": "valid-test-key" },
        payload: { query: "machine learning" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.results.length).toBe(1);
      expect(body.data.results[0].title).toBe("Test Paper");
      expect(body.data.results[0].authors).toContain("John Doe");

      globalThis.fetch = originalFetch;
    });

    it("should reject empty query", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/papers/search",
        headers: { "x-api-key": "valid-test-key" },
        payload: { query: "" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
