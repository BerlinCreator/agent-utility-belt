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

describe("Social Data API", () => {
  describe("POST /v1/social/twitter/profile", () => {
    it("should return coming_soon for twitter", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/social/twitter/profile",
        headers: { "x-api-key": "valid-test-key" },
        payload: { username: "testuser" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.platform).toBe("twitter");
      expect(body.data.data.status).toBe("coming_soon");
    });

    it("should require username", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/social/twitter/profile",
        headers: { "x-api-key": "valid-test-key" },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /v1/social/reddit/subreddit", () => {
    it("should validate subreddit format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/social/reddit/subreddit",
        headers: { "x-api-key": "valid-test-key" },
        payload: { subreddit: "invalid subreddit!!" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should require auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/social/reddit/subreddit",
        payload: { subreddit: "javascript" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /v1/social/youtube/channel", () => {
    it("should require channelId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/social/youtube/channel",
        headers: { "x-api-key": "valid-test-key" },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
