import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Audit API", () => {
  it("POST /v1/audit/log creates an audit entry", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "audit-1", actor: "user-123", action: "login", resource: "auth",
          metadata: null, createdAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/audit/log", headers, payload: { actor: "user-123", action: "login", resource: "auth" } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.actor).toBe("user-123");
  });

  it("GET /v1/audit/logs returns paginated results", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;

    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount % 2 === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
              }),
            }),
          }),
        };
      }
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: 0 }]) }) };
    });

    const res = await app.inject({ method: "GET", url: "/v1/audit/logs?page=1&limit=10", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).pagination).toBeDefined();
  });
});
