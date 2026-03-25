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

describe("Email Validator API", () => {
  describe("POST /v1/email/validate", () => {
    it("should validate a well-formed email", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/email/validate",
        headers: { "x-api-key": "valid-test-key" },
        payload: { email: "test@gmail.com" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.email).toBe("test@gmail.com");
      expect(body.data.syntax).toBe(true);
      expect(body.data.domain).toBe("gmail.com");
      expect(body.data.isFreeProvider).toBe(true);
      expect(body.data.isDisposable).toBe(false);
    });

    it("should reject invalid email syntax", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/email/validate",
        headers: { "x-api-key": "valid-test-key" },
        payload: { email: "not-an-email" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.syntax).toBe(false);
      expect(body.data.valid).toBe(false);
    });

    it("should detect disposable email domains", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/email/validate",
        headers: { "x-api-key": "valid-test-key" },
        payload: { email: "test@mailinator.com" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.isDisposable).toBe(true);
    });

    it("should suggest corrections for typos", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/email/validate",
        headers: { "x-api-key": "valid-test-key" },
        payload: { email: "user@gamil.com" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.suggestion).toBe("user@gmail.com");
    });

    it("should require email field", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/email/validate",
        headers: { "x-api-key": "valid-test-key" },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /v1/email/validate/bulk", () => {
    it("should validate multiple emails", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/email/validate/bulk",
        headers: { "x-api-key": "valid-test-key" },
        payload: { emails: ["test@gmail.com", "invalid", "user@mailinator.com"] },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.results).toHaveLength(3);
      expect(body.data.total).toBe(3);
    });
  });
});
