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

describe("Patent Search API", () => {
  describe("POST /v1/patents/search", () => {
    it("should search for patents", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(`<html><body>
          <article class="result-item">
            <h3 class="result-title">Test Patent Title</h3>
            <span class="patent-number">US1234567</span>
            <p>A test patent abstract</p>
            <span class="assignee">Test Corp</span>
            <span class="filing-date">2024-01-15</span>
          </article>
        </body></html>`),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/patents/search",
        headers: { "x-api-key": "valid-test-key" },
        payload: { query: "blockchain" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.query).toBe("blockchain");

      globalThis.fetch = originalFetch;
    });

    it("should reject empty query", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/patents/search",
        headers: { "x-api-key": "valid-test-key" },
        payload: { query: "" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
