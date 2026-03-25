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

describe("Product Scraper API", () => {
  describe("POST /v1/product/extract", () => {
    it("should extract product data from a page", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(`<html>
          <head>
            <title>Test Product</title>
            <meta property="og:title" content="Amazing Widget">
            <meta property="product:price:amount" content="29.99">
            <meta property="product:price:currency" content="USD">
            <meta property="og:image" content="https://example.com/product.jpg">
            <meta property="og:description" content="A great product">
          </head>
          <body>
            <h1>Amazing Widget</h1>
            <span class="price">$29.99</span>
          </body>
        </html>`),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/product/extract",
        headers: { "x-api-key": "valid-test-key" },
        payload: { url: "https://shop.example.com/product/1" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.title).toBe("Amazing Widget");
      expect(body.data.price).toBe("29.99");
      expect(body.data.currency).toBe("USD");

      globalThis.fetch = originalFetch;
    });

    it("should reject invalid URL", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/product/extract",
        headers: { "x-api-key": "valid-test-key" },
        payload: { url: "not-a-url" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
