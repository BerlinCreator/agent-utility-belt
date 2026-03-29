import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Quota API", () => {
  it("POST /v1/quota/check returns quota status", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/quota/check", headers, payload: { key: "user-123", limit: 100, windowMs: 60000 } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.allowed).toBe(true);
    expect(body.data.key).toBe("user-123");
  });

  it("POST /v1/quota/consume consumes quota", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/quota/consume", headers, payload: { key: "user-123", cost: 1, limit: 100, windowMs: 60000 } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.consumed).toBe(1);
  });

  it("GET /v1/quota/status/:key returns current count", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/quota/status/user-123", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.key).toBe("user-123");
  });
});
