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

describe("Code Runner API", () => {
  describe("POST /v1/code/execute", () => {
    it("should execute JavaScript code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/code/execute",
        headers: { "x-api-key": "valid-test-key" },
        payload: {
          language: "javascript",
          code: "console.log(2 + 2)",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.output).toContain("4");
      expect(body.data.language).toBe("javascript");
      expect(body.data.executionTime).toBeGreaterThanOrEqual(0);
    });

    it("should return expression results", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/code/execute",
        headers: { "x-api-key": "valid-test-key" },
        payload: {
          language: "javascript",
          code: "Math.pow(2, 10)",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.output).toContain("1024");
    });

    it("should block dangerous code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/code/execute",
        headers: { "x-api-key": "valid-test-key" },
        payload: {
          language: "javascript",
          code: "require('fs').readFileSync('/etc/passwd')",
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should block process access in code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/code/execute",
        headers: { "x-api-key": "valid-test-key" },
        payload: {
          language: "javascript",
          code: "process.exit(1)",
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
