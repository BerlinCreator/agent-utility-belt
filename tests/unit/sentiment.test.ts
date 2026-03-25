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

describe("Sentiment Analyzer API", () => {
  describe("POST /v1/sentiment/analyze", () => {
    it("should detect positive sentiment", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/sentiment/analyze",
        headers: { "x-api-key": "valid-test-key" },
        payload: { text: "This product is amazing and wonderful! I love it." },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.sentiment).toBe("positive");
      expect(body.data.score).toBeGreaterThan(0);
      expect(body.data.words.positive.length).toBeGreaterThan(0);
    });

    it("should detect negative sentiment", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/sentiment/analyze",
        headers: { "x-api-key": "valid-test-key" },
        payload: { text: "This is terrible and horrible. I hate it." },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.sentiment).toBe("negative");
      expect(body.data.score).toBeLessThan(0);
      expect(body.data.words.negative.length).toBeGreaterThan(0);
    });

    it("should detect neutral sentiment", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/sentiment/analyze",
        headers: { "x-api-key": "valid-test-key" },
        payload: { text: "The meeting is scheduled for Tuesday at 3pm in the conference room." },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.sentiment).toBe("neutral");
    });

    it("should reject empty text", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/sentiment/analyze",
        headers: { "x-api-key": "valid-test-key" },
        payload: { text: "" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
