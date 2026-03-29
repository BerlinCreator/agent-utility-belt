import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Secret API", () => {
  it("POST /v1/secret/create stores an encrypted secret", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "secret-1", name: "API_TOKEN", version: 1, createdAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/secret/create", headers, payload: { name: "API_TOKEN", value: "sk-12345678" } });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe("API_TOKEN");
    expect(body.data.masked).toContain("****");
  });

  it("GET /v1/secret/:id returns 404 for nonexistent", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/secret/nonexistent-id", headers });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/secret/create validates input", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/secret/create", headers, payload: { name: "", value: "" } });
    expect(res.statusCode).toBe(400);
  });
});
