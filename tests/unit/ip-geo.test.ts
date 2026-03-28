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

describe("IP Geo API", () => {
  it("should prefer x-forwarded-for for /v1/ip/me", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: "success",
        query: "8.8.8.8",
        country: "United States",
        countryCode: "US",
        region: "CA",
        regionName: "California",
        city: "Mountain View",
        zip: "94043",
        lat: 37.386,
        lon: -122.0838,
        timezone: "America/Los_Angeles",
        isp: "Google",
        org: "Google",
        as: "AS15169 Google LLC",
      }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/ip/me",
      headers: {
        "x-api-key": "valid-test-key",
        "x-forwarded-for": "8.8.8.8, 10.0.0.1",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.ip).toBe("8.8.8.8");

    globalThis.fetch = originalFetch;
  });
});
