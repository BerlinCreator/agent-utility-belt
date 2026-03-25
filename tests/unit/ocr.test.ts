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

describe("OCR API", () => {
  describe("POST /v1/ocr/extract", () => {
    it("should extract data from receipt text", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/ocr/extract",
        headers: {
          "x-api-key": "valid-test-key",
          "content-type": "application/json",
        },
        payload: {
          text: `Acme Store
123 Main Street
Date: 12/25/2024

Widget A    9.99
Widget B    14.99
Tax         2.50

Total: $27.48`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.vendor).toBe("Acme Store");
      expect(body.data.date).toBe("12/25/2024");
      expect(body.data.total).toBe("27.48");
      expect(body.data.currency).toBe("USD");
      expect(body.data.items.length).toBeGreaterThan(0);
    });

    it("should reject empty request", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/ocr/extract",
        headers: {
          "x-api-key": "valid-test-key",
          "content-type": "application/json",
        },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
