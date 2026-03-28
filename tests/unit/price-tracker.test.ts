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

describe("Price Tracker API", () => {
  describe("POST /v1/price/lookup", () => {
    it("should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/price/lookup",
        payload: { url: "https://www.amazon.com/dp/B09V3KXJPB" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should validate url is required", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/price/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should accept query-only lookups", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`
          <html><body>
            <h3>iPhone 16 Deals</h3>
            <div data-sh-orig-price="999.99" data-sh-currency="USD"></div>
            <img src="https://img.example.com/iphone.jpg" />
          </body></html>
        `),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/price/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { query: "iPhone 16" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.platform).toBe("search");
      expect(body.data.query).toBe("iPhone 16");
      expect(body.data.price).toBe("999.99");

      globalThis.fetch = originalFetch;
    });

    it("should detect amazon platform and parse price", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`
          <html><body>
            <span id="productTitle">Test Product</span>
            <span class="a-price-symbol">$</span>
            <span class="a-price-whole">29.</span>
            <span class="a-price-fraction">99</span>
            <div id="availability"><span>In Stock</span></div>
            <img id="landingImage" src="https://img.example.com/product.jpg" />
          </body></html>
        `),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/price/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { url: "https://www.amazon.com/dp/B09V3KXJPB" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.platform).toBe("amazon");
      expect(body.data.title).toBe("Test Product");
      expect(body.data.price).toBe("29.99");
      expect(body.data.currency).toBe("$");

      globalThis.fetch = originalFetch;
    });
  });
});
