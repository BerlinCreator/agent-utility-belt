import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Policy API", () => {
  it("POST /v1/policy/policy creates a policy", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "pol-1", name: "admin-access", rules: [{ conditions: { operator: "eq", field: "role", value: "admin" }, action: "allow", priority: 1 }],
          isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/policy/policy", headers,
      payload: { name: "admin-access", rules: [{ conditions: { operator: "eq", field: "role", value: "admin" }, action: "allow", priority: 1 }] },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.name).toBe("admin-access");
  });

  it("POST /v1/policy/evaluate evaluates policy — allow", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "pol-1", rules: [{ conditions: { operator: "eq", field: "role", value: "admin" }, action: "allow", priority: 1 }], isActive: true,
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/policy/evaluate", headers, payload: { policyId: "pol-1", context: { role: "admin" } } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.allowed).toBe(true);
  });

  it("POST /v1/policy/evaluate — deny for non-matching", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "pol-1", rules: [{ conditions: { operator: "eq", field: "role", value: "admin" }, action: "allow", priority: 1 }], isActive: true,
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/policy/evaluate", headers, payload: { policyId: "pol-1", context: { role: "user" } } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.allowed).toBe(false);
  });

  it("POST /v1/policy/policy returns 400 for missing name", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/policy/policy", headers,
      payload: { rules: [{ conditions: { operator: "eq", field: "role", value: "admin" }, action: "allow" }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/policy/policy returns 400 for missing rules", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/policy/policy", headers, payload: { name: "test-policy" } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/policy/policy returns 400 for wrong type name", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/policy/policy", headers,
      payload: { name: 123, rules: [{ conditions: { operator: "eq", field: "role", value: "admin" }, action: "allow" }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/policy/policy returns 401 without api-key", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/policy/policy",
      payload: { name: "admin-access", rules: [{ conditions: { operator: "eq", field: "role", value: "admin" }, action: "allow" }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/policy/policy returns 401 with invalid api-key", async () => {
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

    const res = await app.inject({
      method: "POST", url: "/v1/policy/policy", headers: { "x-api-key": "invalid-key" },
      payload: { name: "admin-access", rules: [{ conditions: { operator: "eq", field: "role", value: "admin" }, action: "allow" }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("success response has correct format", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "pol-1", rules: [{ conditions: { operator: "eq", field: "role", value: "admin" }, action: "allow", priority: 1 }], isActive: true,
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/policy/evaluate", headers, payload: { policyId: "pol-1", context: { role: "admin" } } });
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("allowed");
    expect(body.data).toHaveProperty("policyId");
  });

  it("GET /v1/policy/policy/:id returns 404 for missing", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/policy/policy/nonexistent-id", headers });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /v1/policy/policy/:id returns 404 for missing", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    });

    const res = await app.inject({ method: "DELETE", url: "/v1/policy/policy/nonexistent-id", headers });
    expect(res.statusCode).toBe(404);
  });
});
