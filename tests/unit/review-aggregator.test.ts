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

describe("Review Aggregator API", () => {
  describe("POST /v1/reviews/fetch", () => {
    it("should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/reviews/fetch",
        payload: { url: "https://www.amazon.com/dp/B09V3KXJPB" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should validate url is required", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/reviews/fetch",
        headers: { "x-api-key": "valid-test-key" },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should fetch and parse reviews from a page", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`
          <html><body>
            <span id="productTitle">Test Product</span>
            <span id="acrCustomerReviewText">1,234 ratings</span>
            <span id="acrPopover" title="4.5 out of 5 stars"></span>
            <div data-hook="review">
              <span class="a-profile-name">John</span>
              <i data-hook="review-star-rating"><span>5.0 out of 5 stars</span></i>
              <a data-hook="review-title"><span>Great product</span></a>
              <span data-hook="review-body"><span>Really loved it</span></span>
              <span data-hook="review-date">Reviewed on March 1, 2026</span>
            </div>
          </body></html>
        `),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/reviews/fetch",
        headers: { "x-api-key": "valid-test-key" },
        payload: { url: "https://www.amazon.com/dp/B09V3KXJPB" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.product).toBe("Test Product");
      expect(body.data.totalReviews).toBe("1,234");
      expect(body.data.averageRating).toBe("4.5");
      expect(body.data.reviews).toHaveLength(1);
      expect(body.data.reviews[0].author).toBe("John");

      globalThis.fetch = originalFetch;
    });
  });
});
