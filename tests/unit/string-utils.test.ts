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

  // Mock auth lookup
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([mockApiKey]),
      }),
    }),
  } as ReturnType<typeof db.select>);

  // Mock rate limit update
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

describe("String Utilities API", () => {
  describe("POST /v1/string/hash", () => {
    it("should hash a string with SHA256", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/hash",
        headers: { "x-api-key": "valid-test-key" },
        payload: { input: "hello world", algorithm: "sha256" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
      expect(body.data.algorithm).toBe("sha256");
    });

    it("should hash with MD5", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/hash",
        headers: { "x-api-key": "valid-test-key" },
        payload: { input: "hello world", algorithm: "md5" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.hash).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3");
    });

    it("should reject missing input", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/hash",
        headers: { "x-api-key": "valid-test-key" },
        payload: { algorithm: "sha256" },
      });

      // Zod validation will fail
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /v1/string/encode", () => {
    it("should base64 encode a string", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/encode",
        headers: { "x-api-key": "valid-test-key" },
        payload: { input: "hello world", encoding: "base64" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.encoded).toBe("aGVsbG8gd29ybGQ=");
    });

    it("should URL encode a string", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/encode",
        headers: { "x-api-key": "valid-test-key" },
        payload: { input: "hello world & foo=bar", encoding: "url" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.encoded).toBe("hello%20world%20%26%20foo%3Dbar");
    });
  });

  describe("POST /v1/string/decode", () => {
    it("should base64 decode a string", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/decode",
        headers: { "x-api-key": "valid-test-key" },
        payload: { input: "aGVsbG8gd29ybGQ=", encoding: "base64" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.decoded).toBe("hello world");
    });
  });

  describe("POST /v1/string/slugify", () => {
    it("should slugify a string", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/slugify",
        headers: { "x-api-key": "valid-test-key" },
        payload: { input: "Hello World! This is a test" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.slug).toBe("hello-world-this-is-a-test");
    });
  });

  describe("POST /v1/string/truncate", () => {
    it("should truncate a long string", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/truncate",
        headers: { "x-api-key": "valid-test-key" },
        payload: { input: "This is a very long string that should be truncated", length: 20 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.truncated).toBe("This is a very lo...");
      expect(body.data.truncatedLength).toBe(20);
    });
  });

  describe("POST /v1/string/generate", () => {
    it("should generate a random string", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/generate",
        headers: { "x-api-key": "valid-test-key" },
        payload: { length: 16, charset: "hex" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.generated).toMatch(/^[0-9a-f]{16}$/);
      expect(body.data.length).toBe(16);
    });
  });

  describe("POST /v1/string/case", () => {
    it("should convert to camelCase", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/case",
        headers: { "x-api-key": "valid-test-key" },
        payload: { input: "hello world", to: "camel" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.converted).toBe("helloWorld");
    });

    it("should convert to snake_case", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/case",
        headers: { "x-api-key": "valid-test-key" },
        payload: { input: "helloWorld", to: "snake" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.converted).toBe("hello_world");
    });

    it("should convert to CONSTANT_CASE", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/string/case",
        headers: { "x-api-key": "valid-test-key" },
        payload: { input: "hello world", to: "constant" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.converted).toBe("HELLO_WORLD");
    });
  });
});
