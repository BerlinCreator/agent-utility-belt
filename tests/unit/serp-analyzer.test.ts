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

describe("SERP Analyzer API", () => {
  describe("POST /v1/serp/search", () => {
    it("should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/serp/search",
        payload: { query: "test query" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should validate query is required", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/serp/search",
        headers: { "x-api-key": "valid-test-key" },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should search and return structured results", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`
          <html><body>
            <div id="result-stats">About 1,000,000 results</div>
            <div class="g">
              <a href="https://example.com"><h3>Example Result</h3></a>
              <div class="VwiC3b">This is a test snippet</div>
            </div>
          </body></html>
        `),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/serp/search",
        headers: { "x-api-key": "valid-test-key" },
        payload: { query: "test query" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.query).toBe("test query");
      expect(Array.isArray(body.data.results)).toBe(true);

      globalThis.fetch = originalFetch;
    });
  });
});
