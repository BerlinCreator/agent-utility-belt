import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Queue API", () => {
  it("POST /v1/queue/enqueue adds a job", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/queue/enqueue", headers, payload: { queue: "tasks", payload: { type: "email" } } });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.queue).toBe("tasks");
    expect(body.data.id).toBeDefined();
    expect(body.data.status).toBe("pending");
  });

  it("POST /v1/queue/dequeue returns null when empty", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/queue/dequeue", headers, payload: { queue: "tasks" } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.job).toBeNull();
  });

  it("GET /v1/queue/size/:queue returns size", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/queue/size/tasks", headers });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.queue).toBe("tasks");
    expect(typeof body.data.pending).toBe("number");
  });

  it("GET /v1/queue/peek/:queue returns null when empty", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/queue/peek/tasks", headers });
    expect(res.statusCode).toBe(200);
  });
});
