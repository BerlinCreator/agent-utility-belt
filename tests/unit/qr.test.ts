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

describe("QR/Barcode API", () => {
  describe("POST /v1/qr/generate", () => {
    it("should generate a PNG QR code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/qr/generate",
        headers: {
          "x-api-key": "valid-test-key",
          "content-type": "application/json",
        },
        payload: { data: "https://example.com", format: "png" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");
      expect(response.rawPayload.length).toBeGreaterThan(0);
    });

    it("should generate an SVG QR code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/qr/generate",
        headers: {
          "x-api-key": "valid-test-key",
          "content-type": "application/json",
        },
        payload: { data: "https://example.com", format: "svg" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("svg");
      expect(response.payload).toContain("<svg");
    });

    it("should reject empty data", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/qr/generate",
        headers: {
          "x-api-key": "valid-test-key",
          "content-type": "application/json",
        },
        payload: { data: "" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /v1/qr/barcode", () => {
    it("should generate a Code128 barcode", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/qr/barcode",
        headers: {
          "x-api-key": "valid-test-key",
          "content-type": "application/json",
        },
        payload: { data: "12345678", type: "code128" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");
    });
  });
});
