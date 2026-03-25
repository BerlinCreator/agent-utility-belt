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

describe("Lead Enrichment API", () => {
  describe("POST /v1/enrich/email", () => {
    it("should enrich an email address", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/enrich/email",
        headers: { "x-api-key": "valid-test-key" },
        payload: { email: "user@example.com" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.email).toBe("user@example.com");
      expect(body.data.domain).toBe("example.com");
      expect(body.data.company).toBe("Example");
      expect(typeof body.data.confidence).toBe("number");
    });

    it("should reject invalid email", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/enrich/email",
        headers: { "x-api-key": "valid-test-key" },
        payload: { email: "not-an-email" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/enrich/email",
        payload: { email: "user@example.com" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /v1/enrich/domain", () => {
    it("should enrich a domain", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/enrich/domain",
        headers: { "x-api-key": "valid-test-key" },
        payload: { domain: "example.com" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.domain).toBe("example.com");
    });

    it("should require domain field", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/enrich/domain",
        headers: { "x-api-key": "valid-test-key" },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
