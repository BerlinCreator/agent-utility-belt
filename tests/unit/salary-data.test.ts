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

describe("Salary Data API", () => {
  describe("POST /v1/salary/lookup", () => {
    it("should return salary data for software engineer", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/salary/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { role: "software engineer" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.role).toBe("software engineer");
      expect(body.data.min).toBeGreaterThan(0);
      expect(body.data.median).toBeGreaterThan(body.data.min);
      expect(body.data.max).toBeGreaterThan(body.data.median);
    });

    it("should apply location multiplier", async () => {
      const sfResponse = await app.inject({
        method: "POST",
        url: "/v1/salary/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { role: "software engineer", location: "San Francisco" },
      });

      const avgResponse = await app.inject({
        method: "POST",
        url: "/v1/salary/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { role: "software engineer" },
      });

      const sfBody = JSON.parse(sfResponse.payload);
      const avgBody = JSON.parse(avgResponse.payload);
      expect(sfBody.data.median).toBeGreaterThan(avgBody.data.median);
    });

    it("should return 404 for unknown role", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/salary/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { role: "underwater basket weaving specialist" },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
