import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Rank API — POST /v1/rank/score", () => {
  it("ranks items by weighted score descending by default", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rank/score",
      headers,
      payload: {
        items: [
          { id: "a", scores: { quality: 3, speed: 5 } },
          { id: "b", scores: { quality: 9, speed: 2 } },
          { id: "c", scores: { quality: 5, speed: 5 } },
        ],
        weights: { quality: 2, speed: 1 },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.ranked[0].id).toBe("b"); // 9*2 + 2*1 = 20
    expect(body.data.ranked[1].id).toBe("c"); // 5*2 + 5*1 = 15
    expect(body.data.ranked[2].id).toBe("a"); // 3*2 + 5*1 = 11
    expect(body.data.count).toBe(3);
  });

  it("ranks items ascending when order is asc", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rank/score",
      headers,
      payload: {
        items: [
          { id: "a", scores: { x: 10 } },
          { id: "b", scores: { x: 1 } },
        ],
        weights: { x: 1 },
        order: "asc",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.ranked[0].id).toBe("b");
    expect(body.data.ranked[1].id).toBe("a");
  });

  it("normalize option rescales scores before ranking", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rank/score",
      headers,
      payload: {
        items: [
          { id: "a", scores: { x: 100 } },
          { id: "b", scores: { x: 200 } },
          { id: "c", scores: { x: 300 } },
        ],
        weights: { x: 1 },
        normalize: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // After normalization: a=0, b=0.5, c=1
    expect(body.data.ranked[0].id).toBe("c");
    expect(body.data.ranked[0].totalScore).toBeCloseTo(1);
    expect(body.data.ranked[2].totalScore).toBeCloseTo(0);
  });

  it("limit parameter limits the number of results", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rank/score",
      headers,
      payload: {
        items: [
          { id: "a", scores: { x: 1 } },
          { id: "b", scores: { x: 2 } },
          { id: "c", scores: { x: 3 } },
        ],
        weights: { x: 1 },
        limit: 2,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.ranked.length).toBe(2);
    expect(body.data.count).toBe(2);
  });

  it("returns 400 when weights object is empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rank/score",
      headers,
      payload: {
        items: [{ id: "a", scores: { x: 1 } }],
        weights: {},
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("single item returns that item ranked", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rank/score",
      headers,
      payload: {
        items: [{ id: "only", scores: { x: 42 } }],
        weights: { x: 1 },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.ranked.length).toBe(1);
    expect(body.data.ranked[0].id).toBe("only");
    expect(body.data.ranked[0].totalScore).toBe(42);
  });

  it("missing scores key defaults to 0 for weighted calculation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rank/score",
      headers,
      payload: {
        items: [
          { id: "a", scores: { x: 10 } },
          { id: "b", scores: { y: 10 } },
        ],
        weights: { x: 1 },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // "b" has no "x" score, so defaults to 0
    expect(body.data.ranked[0].id).toBe("a");
    expect(body.data.ranked[1].totalScore).toBe(0);
  });
});
