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

describe("Company Data API", () => {
  describe("POST /v1/company/lookup", () => {
    it("should look up company data from a domain", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(`<html>
          <head>
            <title>Example Corp | Technology Company</title>
            <meta property="og:site_name" content="Example Corp">
            <meta property="og:description" content="A technology company">
            <meta property="og:image" content="https://example.com/logo.png">
          </head>
          <body>
            <a href="https://twitter.com/examplecorp">Twitter</a>
            <a href="https://linkedin.com/company/examplecorp">LinkedIn</a>
          </body>
        </html>`),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/company/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { domain: "example.com" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.domain).toBe("example.com");
      expect(body.data.name).toBe("Example Corp");
      expect(body.data.description).toBe("A technology company");
      expect(body.data.social.twitter).toContain("twitter.com");

      globalThis.fetch = originalFetch;
    });

    it("should reject empty domain", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/company/lookup",
        headers: { "x-api-key": "valid-test-key" },
        payload: { domain: "" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
