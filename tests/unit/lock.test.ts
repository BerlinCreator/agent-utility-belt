import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Lock API", () => {
  it("POST /v1/lock/acquire returns 201", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/lock/acquire", headers, payload: { resource: "my-resource", ttl: 5000 } });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.resource).toBe("my-resource");
    expect(body.data.lockId).toBeDefined();
  });

  it("GET /v1/lock/status/:resource returns lock info", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/lock/status/my-resource", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.resource).toBe("my-resource");
  });

  it("POST /v1/lock/release releases a lock", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/lock/release", headers, payload: { resource: "my-resource", lockId: "test-lock-id" } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.released).toBe(true);
  });
});
