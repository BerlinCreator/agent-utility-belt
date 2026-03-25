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

describe("Mock Server API", () => {
  describe("POST /v1/mock/create", () => {
    it("should create a mock endpoint", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/mock/create",
        headers: { "x-api-key": "valid-test-key" },
        payload: {
          method: "GET",
          responseCode: 200,
          responseBody: { message: "hello" },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.method).toBe("GET");
      expect(body.data.responseCode).toBe(200);
      expect(body.data.path).toContain("/v1/mock/serve/");
    });
  });

  describe("GET /v1/mock/mocks", () => {
    it("should list all mocks", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/mock/mocks",
        headers: { "x-api-key": "valid-test-key" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.mocks)).toBe(true);
    });
  });

  describe("Mock serve lifecycle", () => {
    it("should create, serve, and delete a mock", async () => {
      // Create
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/mock/create",
        headers: { "x-api-key": "valid-test-key" },
        payload: {
          method: "GET",
          responseCode: 200,
          responseBody: { data: "test response" },
        },
      });

      const { id } = JSON.parse(createRes.payload).data;

      // Serve
      const serveRes = await app.inject({
        method: "GET",
        url: `/v1/mock/serve/${id}`,
        headers: { "x-api-key": "valid-test-key" },
      });

      expect(serveRes.statusCode).toBe(200);
      const serveBody = JSON.parse(serveRes.payload);
      expect(serveBody.data).toBe("test response");

      // Delete
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/v1/mock/serve/${id}`,
        headers: { "x-api-key": "valid-test-key" },
      });

      expect(deleteRes.statusCode).toBe(200);

      // Verify deleted
      const afterDeleteRes = await app.inject({
        method: "GET",
        url: `/v1/mock/serve/${id}`,
        headers: { "x-api-key": "valid-test-key" },
      });

      expect(afterDeleteRes.statusCode).toBe(404);
    });
  });
});
