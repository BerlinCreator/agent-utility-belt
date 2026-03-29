import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Diff API — POST /v1/diff/compare", () => {
  it("returns identical:true when left and right are the same", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/diff/compare",
      headers,
      payload: { left: "hello world", right: "hello world" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.identical).toBe(true);
    expect(body.data.changes).toEqual([]);
    expect(body.data.stats).toEqual({ additions: 0, deletions: 0, unchanged: 0 });
  });

  it("returns line-level changes in default lines mode", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/diff/compare",
      headers,
      payload: { left: "line one\nline two\n", right: "line one\nline three\n" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.identical).toBe(false);
    expect(body.data.changes.length).toBeGreaterThan(0);
    expect(body.data.stats.additions).toBeGreaterThan(0);
    expect(body.data.stats.deletions).toBeGreaterThan(0);
  });

  it("returns word-level changes in words mode", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/diff/compare",
      headers,
      payload: { left: "the quick brown fox", right: "the slow brown fox", mode: "words" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.identical).toBe(false);
    const added = body.data.changes.filter((c: { added: boolean }) => c.added);
    const removed = body.data.changes.filter((c: { removed: boolean }) => c.removed);
    expect(added.length).toBeGreaterThan(0);
    expect(removed.length).toBeGreaterThan(0);
  });

  it("returns char-level changes in chars mode", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/diff/compare",
      headers,
      payload: { left: "abc", right: "axc", mode: "chars" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.identical).toBe(false);
    expect(body.data.changes.length).toBeGreaterThan(0);
  });

  it("returns patch string in patch mode", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/diff/compare",
      headers,
      payload: { left: "line one\nline two\n", right: "line one\nline three\n", mode: "patch" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.identical).toBe(false);
    expect(typeof body.data.patch).toBe("string");
    expect(body.data.patch).toContain("---");
    expect(body.data.patch).toContain("+++");
  });

  it("returns 400 when left field is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/diff/compare",
      headers,
      payload: { right: "hello" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when body is empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/diff/compare",
      headers,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
