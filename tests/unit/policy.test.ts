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
});
