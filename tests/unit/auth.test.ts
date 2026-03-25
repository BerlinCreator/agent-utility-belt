import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";
import { db } from "../../src/db/connection.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("Auth Middleware", () => {
  it("should reject requests without API key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/string/hash",
      payload: { input: "test", algorithm: "sha256" },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_ERROR");
  });

  it("should reject requests with invalid API key", async () => {
    // Mock DB to return empty (no matching key)
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as ReturnType<typeof db.select>);

    const response = await app.inject({
      method: "POST",
      url: "/v1/string/hash",
      headers: { "x-api-key": "invalid-key" },
      payload: { input: "test", algorithm: "sha256" },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_ERROR");
  });

  it("should reject deactivated API keys", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "test-id",
            userId: "test-user",
            key: "test-key",
            tier: "free",
            isActive: false,
            callsThisMonth: 0,
            monthlyLimit: 100,
            createdAt: new Date(),
            expiresAt: null,
          }]),
        }),
      }),
    } as ReturnType<typeof db.select>);

    const response = await app.inject({
      method: "POST",
      url: "/v1/string/hash",
      headers: { "x-api-key": "test-key" },
      payload: { input: "test", algorithm: "sha256" },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error.message).toContain("deactivated");
  });
});
