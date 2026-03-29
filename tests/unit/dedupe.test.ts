import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Dedupe API — POST /v1/dedupe/match", () => {
  it("detects exact duplicates", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/dedupe/match",
      headers,
      payload: { items: ["hello", "world", "hello"] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.stats.uniqueCount).toBe(2);
    expect(body.data.stats.duplicateCount).toBe(1);
    expect(body.data.duplicates.length).toBe(1);
    expect(body.data.duplicates[0].similarity).toBe(1);
  });

  it("detects fuzzy duplicates above threshold", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/dedupe/match",
      headers,
      payload: { items: ["kitten", "kittens", "dog"], threshold: 0.7 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // "kitten" and "kittens" are very similar
    expect(body.data.duplicates.length).toBeGreaterThan(0);
    expect(body.data.stats.uniqueCount).toBe(2);
  });

  it("respects threshold — no match below it", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/dedupe/match",
      headers,
      payload: { items: ["apple", "orange", "banana"], threshold: 0.9 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.duplicates.length).toBe(0);
    expect(body.data.stats.uniqueCount).toBe(3);
  });

  it("is case insensitive by default", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/dedupe/match",
      headers,
      payload: { items: ["Hello", "hello", "HELLO"] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.stats.uniqueCount).toBe(1);
    expect(body.data.stats.duplicateCount).toBe(2);
  });

  it("case sensitive mode treats different cases as distinct", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/dedupe/match",
      headers,
      payload: { items: ["Hello", "hello", "HELLO"], caseSensitive: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Levenshtein distance between "Hello" and "hello" is 1 out of 5 -> 0.8 similarity
    // With default threshold 0.8, they may still match; but "HELLO" vs "Hello" is dist 4 -> 0.2
    // The key point: more unique items than case-insensitive mode
    expect(body.data.stats.uniqueCount).toBeGreaterThanOrEqual(2);
  });

  it("returns groups when returnGroups is true", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/dedupe/match",
      headers,
      payload: { items: ["cat", "cat", "dog"], returnGroups: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.groups).toBeDefined();
    expect(body.data.groups.length).toBe(2);
    const catGroup = body.data.groups.find((g: { canonical: string }) => g.canonical === "cat");
    expect(catGroup.members.length).toBe(2);
  });

  it("single item returns itself as unique", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/dedupe/match",
      headers,
      payload: { items: ["solo"] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.unique).toEqual(["solo"]);
    expect(body.data.stats.uniqueCount).toBe(1);
    expect(body.data.stats.duplicateCount).toBe(0);
    expect(body.data.duplicates.length).toBe(0);
  });
});
