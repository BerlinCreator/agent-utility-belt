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

  it("POST /v1/webhook/register returns 400 for missing url", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/webhook/register", headers, payload: { events: ["order.created"] } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/webhook/register returns 400 for wrong type url", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/webhook/register", headers, payload: { url: 123 } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/webhook/register returns 401 without api-key", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/webhook/register", payload: { url: "https://example.com/webhook", events: ["order.created"] } });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/webhook/register returns 401 with invalid api-key", async () => {
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

    const res = await app.inject({ method: "POST", url: "/v1/webhook/register", headers: { "x-api-key": "invalid-key" }, payload: { url: "https://example.com/webhook", events: ["order.created"] } });
    expect(res.statusCode).toBe(401);
  });

  it("success response has correct format", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "wh-2", url: "https://example.com/hook", events: ["user.created"],
          secret: null, isActive: true, metadata: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({ method: "POST", url: "/v1/webhook/register", headers, payload: { url: "https://example.com/hook", events: ["user.created"] } });
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("id");
    expect(body.data).toHaveProperty("url");
  });

  it("GET /v1/webhook/logs/:webhookId returns delivery logs", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/webhook/logs/wh-1", headers });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("success", true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
