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

describe("Resume Parser API", () => {
  describe("POST /v1/resume/parse", () => {
    it("should parse resume text and extract info", async () => {
      const resumeText = `John Smith
john.smith@email.com
(555) 123-4567

Experience
Senior Software Engineer at Google
Jan 2020 - Present

Junior Developer at Startup Inc
Jun 2017 - Dec 2019

Education
Bachelor of Science in Computer Science
University of California
2017

Skills: JavaScript, TypeScript, Python, React, Node.js, Docker, AWS`;

      const response = await app.inject({
        method: "POST",
        url: "/v1/resume/parse",
        headers: {
          "x-api-key": "valid-test-key",
          "content-type": "application/json",
        },
        payload: { text: resumeText },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("John Smith");
      expect(body.data.email).toBe("john.smith@email.com");
      expect(body.data.phone).toBe("(555) 123-4567");
      expect(body.data.skills.length).toBeGreaterThan(0);
      expect(body.data.skills).toContain("javascript");
      expect(body.data.skills).toContain("typescript");
    });

    it("should reject short text", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/resume/parse",
        headers: {
          "x-api-key": "valid-test-key",
          "content-type": "application/json",
        },
        payload: { text: "short" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
