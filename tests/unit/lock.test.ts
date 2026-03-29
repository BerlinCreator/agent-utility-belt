import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Lock API", () => {
  it("POST /v1/lock/acquire returns 201", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/lock/acquire", headers, payload: { resource: "my-resource", ttl: 5000 } });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.resource).toBe("my-resource");
    expect(body.data.lockId).toBeDefined();
  });

  it("GET /v1/lock/status/:resource returns lock info", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/lock/status/my-resource", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.resource).toBe("my-resource");
  });

  it("POST /v1/lock/release releases a lock", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/lock/release", headers, payload: { resource: "my-resource", lockId: "test-lock-id" } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.released).toBe(true);
  });

  it("POST /v1/lock/acquire returns 400 for missing resource", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/lock/acquire", headers, payload: { ttl: 5000 } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/lock/acquire returns 400 for wrong type resource", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/lock/acquire", headers, payload: { resource: 123, ttl: 5000 } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/lock/acquire returns 401 without api-key", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/lock/acquire", payload: { resource: "my-resource", ttl: 5000 } });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/lock/acquire returns 401 with invalid api-key", async () => {
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

    const res = await app.inject({ method: "POST", url: "/v1/lock/acquire", headers: { "x-api-key": "invalid-key" }, payload: { resource: "my-resource", ttl: 5000 } });
    expect(res.statusCode).toBe(401);
  });

  it("success response has correct format", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/lock/acquire", headers, payload: { resource: "fmt-resource", ttl: 5000 } });
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("lockId");
    expect(body.data).toHaveProperty("resource");
    expect(body.data).toHaveProperty("ttl");
  });

  it("POST /v1/lock/release returns 400 for missing lockId", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/lock/release", headers, payload: { resource: "my-resource" } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/lock/acquire returns 400 for ttl below minimum", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/lock/acquire", headers, payload: { resource: "my-resource", ttl: 50 } });
    expect(res.statusCode).toBe(400);
  });
});
