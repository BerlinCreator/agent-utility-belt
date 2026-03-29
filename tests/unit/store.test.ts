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
});
