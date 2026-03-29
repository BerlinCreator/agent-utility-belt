import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Webhook API", () => {
  it("POST /v1/webhook/register creates a webhook", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "wh-1", url: "https://example.com/webhook", events: ["order.created"],
          secret: null, isActive: true, metadata: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/webhook/register", headers, payload: { url: "https://example.com/webhook", events: ["order.created"] } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.url).toBe("https://example.com/webhook");
  });

  it("POST /v1/webhook/register validates URL", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/webhook/register", headers, payload: { url: "not-a-url" } });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /v1/webhook/:id returns 404 for nonexistent", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    });

    const res = await app.inject({ method: "DELETE", url: "/v1/webhook/00000000-0000-0000-0000-000000000000", headers });
    expect(res.statusCode).toBe(404);
  });
});
