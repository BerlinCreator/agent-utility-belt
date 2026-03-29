import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Trace API", () => {
  it("POST /v1/trace/start creates a new trace", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const traceData = {
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      name: "my-trace",
      metadata: { env: "test" },
      createdAt: new Date().toISOString(),
    };
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([traceData]),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([traceData]),
        }),
        catch: vi.fn().mockReturnValue(Promise.resolve()),
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/trace/start",
      headers,
      payload: { name: "my-trace", metadata: { env: "test" } },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBe(traceData.id);
    expect(body.data.name).toBe("my-trace");
  });

  it("POST /v1/trace/span creates a span for existing trace", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const traceId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const spanData = {
      id: "11111111-2222-4333-8444-555555555555",
      traceId,
      name: "db-query",
      status: "ok",
      durationMs: 42,
      createdAt: new Date().toISOString(),
    };

    // Mock select -> from -> where -> limit chain for trace lookup
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: traceId, name: "my-trace" }]),
        }),
      }),
    });
    // Mock insert for span creation
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([spanData]),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([spanData]),
        }),
        catch: vi.fn().mockReturnValue(Promise.resolve()),
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/trace/span",
      headers,
      payload: { traceId, name: "db-query", status: "ok", durationMs: 42 },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe("db-query");
    expect(body.data.traceId).toBe(traceId);
  });

  it("POST /v1/trace/span returns 404 for unknown trace", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const fakeTraceId = "00000000-0000-0000-0000-000000000000";

    // Mock select -> from -> where -> limit returning empty
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/trace/span",
      headers,
      payload: { traceId: fakeTraceId, name: "orphan-span" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /v1/trace/:traceId returns trace with spans", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const traceId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const traceData = { id: traceId, name: "my-trace", createdAt: new Date().toISOString() };
    const spanData = [
      { id: "span-1", traceId, name: "span-a", status: "ok" },
      { id: "span-2", traceId, name: "span-b", status: "ok" },
    ];

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First call: trace lookup
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([traceData]),
            }),
          }),
        };
      }
      // Second call: spans lookup
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(spanData),
        }),
      };
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/trace/${traceId}`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.trace.id).toBe(traceId);
    expect(body.data.spans.length).toBe(2);
    expect(body.data.spanCount).toBe(2);
  });

  it("GET /v1/trace/:traceId returns 404 for unknown trace", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const fakeId = "00000000-0000-0000-0000-000000000000";

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/trace/${fakeId}`,
      headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /v1/trace/start with empty body still works (optional fields)", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const traceData = {
      id: "f1e2d3c4-b5a6-4978-8a1b-c2d3e4f5a6b7",
      name: null,
      metadata: null,
      createdAt: new Date().toISOString(),
    };
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([traceData]),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([traceData]),
        }),
        catch: vi.fn().mockReturnValue(Promise.resolve()),
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/trace/start",
      headers,
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBe(traceData.id);
  });
});
