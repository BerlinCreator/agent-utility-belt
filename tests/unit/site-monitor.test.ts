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

describe("Site Monitor API", () => {
  describe("POST /v1/monitor/check", () => {
    it("should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/monitor/check",
        payload: { url: "https://example.com" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should validate url is required", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/monitor/check",
        headers: { "x-api-key": "valid-test-key" },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should validate url format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/monitor/check",
        headers: { "x-api-key": "valid-test-key" },
        payload: { url: "not-a-url" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should check a URL and return status", async () => {
      const originalFetch = globalThis.fetch;
      const mockHeaders = new Map([
        ["content-type", "text/html"],
        ["server", "nginx"],
      ]);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          forEach: (cb: (value: string, key: string) => void) => {
            mockHeaders.forEach((v, k) => cb(v, k));
          },
        },
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/monitor/check",
        headers: { "x-api-key": "valid-test-key" },
        payload: { url: "http://example.com" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.url).toBe("http://example.com");
      expect(body.data.status).toBe("up");
      expect(body.data.statusCode).toBe(200);
      expect(typeof body.data.responseTimeMs).toBe("number");
      expect(body.data.ssl).toBeNull(); // http, not https

      globalThis.fetch = originalFetch;
    });
  });
});
