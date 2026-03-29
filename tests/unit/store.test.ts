import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Store API — KV", () => {
  it("POST /v1/store/kv creates a key-value pair", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "kv-1", key: "config:theme", value: { color: "dark" },
            ttl: null, expiresAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/store/kv", headers, payload: { key: "config:theme", value: { color: "dark" } } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.key).toBe("config:theme");
  });

  it("DELETE /v1/store/kv/:key returns 404 for nonexistent", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    });

    const res = await app.inject({ method: "DELETE", url: "/v1/store/kv/nonexistent", headers });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/store/kv returns 400 for missing key", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/store/kv", headers, payload: { value: "test" } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/store/kv returns 400 for wrong type key", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/store/kv", headers, payload: { key: 123, value: "test" } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/store/kv returns 401 without api-key", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/store/kv", payload: { key: "mykey", value: "myval" } });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/store/kv returns 401 with invalid api-key", async () => {
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

    const res = await app.inject({ method: "POST", url: "/v1/store/kv", headers: { "x-api-key": "invalid-key" }, payload: { key: "mykey", value: "myval" } });
    expect(res.statusCode).toBe(401);
  });

  it("success response has correct format", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "kv-2", key: "mykey", value: "myval",
            ttl: null, expiresAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/store/kv", headers, payload: { key: "mykey", value: "myval" } });
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("key");
  });

  it("GET /v1/store/kv/:key returns 404 for missing key", async () => {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis();
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/store/kv/missing-key", headers });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /v1/store/kv/:key deletes successfully", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "kv-1", key: "config:theme" }]),
      }),
    });

    const res = await app.inject({ method: "DELETE", url: "/v1/store/kv/config:theme", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.deleted).toBe(true);
  });
});
