import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Gate API", () => {
  it("POST /v1/gate/flag creates a feature flag", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "flag-1", key: "dark-mode", enabled: true, rolloutPercentage: 100,
          description: "Dark mode", metadata: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/gate/flag", headers, payload: { key: "dark-mode", enabled: true } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.key).toBe("dark-mode");
  });

  it("GET /v1/gate/evaluate/:flagId evaluates a flag", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ key: "dark-mode", enabled: true, rolloutPercentage: 100 }]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/gate/evaluate/dark-mode", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.enabled).toBe(true);
  });

  it("GET /v1/gate/evaluate/:flagId returns 404 for unknown flag", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/gate/evaluate/nonexistent", headers });
    expect(res.statusCode).toBe(404);
  });
});
