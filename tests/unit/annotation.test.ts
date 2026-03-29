import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Annotation API", () => {
  it("POST /v1/annotation/create returns 201", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "ann-1", target: "doc-42", label: "important", body: "Review this section",
          metadata: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/annotation/create", headers,
      payload: { target: "doc-42", label: "important", body: "Review this section" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.target).toBe("doc-42");
    expect(body.data.label).toBe("important");
  });

  it("GET /v1/annotation/:id returns annotation", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "ann-1", target: "doc-42", label: "important", body: "Review this section",
            metadata: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/annotation/ann-1", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe("ann-1");
  });

  it("GET /v1/annotation/:id returns 404 for nonexistent", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/annotation/nonexistent", headers });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /v1/annotation/:id updates annotation", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "ann-1", target: "doc-42", label: "updated-label", body: "Updated body",
            metadata: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          }]),
        }),
      }),
    });

    const res = await app.inject({
      method: "PUT", url: "/v1/annotation/ann-1", headers,
      payload: { label: "updated-label", body: "Updated body" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.label).toBe("updated-label");
  });

  it("DELETE /v1/annotation/:id deletes annotation", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "ann-1", target: "doc-42", label: "important",
        }]),
      }),
    });

    const res = await app.inject({ method: "DELETE", url: "/v1/annotation/ann-1", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.deleted).toBe(true);
  });

  it("GET /v1/annotation/list returns list", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([
          { id: "ann-1", target: "doc-42", label: "important" },
          { id: "ann-2", target: "doc-43", label: "review" },
        ]),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/annotation/list", headers });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.annotations).toHaveLength(2);
    expect(body.data.count).toBe(2);
  });
});
