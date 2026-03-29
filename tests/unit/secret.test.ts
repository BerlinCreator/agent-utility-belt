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

  it("POST /v1/secret/create validates input — empty name", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/secret/create", headers, payload: { name: "", value: "sk-12345678" } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/secret/create returns 400 for missing name", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/secret/create", headers, payload: { value: "sk-12345678" } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/secret/create returns 400 for missing value", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/secret/create", headers, payload: { name: "API_TOKEN" } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/secret/create returns 400 for wrong type name", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/secret/create", headers, payload: { name: 123, value: "sk-12345678" } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/secret/create returns 401 without api-key", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/secret/create", payload: { name: "API_TOKEN", value: "sk-12345678" } });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/secret/create returns 401 with invalid api-key", async () => {
    const { getSupabaseAdmin } = await import("../../src/lib/supabase.js");
    const mockGetSupabase = getSupabaseAdmin as ReturnType<typeof vi.fn>;
    mockGetSupabase.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/secret/create", headers: { "x-api-key": "invalid-key" }, payload: { name: "API_TOKEN", value: "sk-12345678" } });
    expect(res.statusCode).toBe(401);
  });

  it("success response has correct format", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "secret-2", name: "DB_PASSWORD", version: 1, createdAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/secret/create", headers, payload: { name: "DB_PASSWORD", value: "supersecret123" } });
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("id");
    expect(body.data).toHaveProperty("name");
    expect(body.data).toHaveProperty("masked");
  });

  it("DELETE /v1/secret/:id returns 404 for missing", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    });

    const res = await app.inject({ method: "DELETE", url: "/v1/secret/nonexistent-id", headers });
    expect(res.statusCode).toBe(404);
  });
});
