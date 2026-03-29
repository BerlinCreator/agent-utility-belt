import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Classify API — POST /v1/classify/classify", () => {
  it("classifies text by keywords", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/classify/classify",
      headers,
      payload: {
        text: "The stock market crashed today causing financial panic",
        rules: [
          { label: "finance", keywords: ["stock", "financial", "market"] },
          { label: "sports", keywords: ["goal", "team", "match"] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.bestMatch.label).toBe("finance");
    expect(body.data.bestMatch.matchedKeywords.length).toBeGreaterThan(0);
  });

  it("multiLabel returns multiple matches", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/classify/classify",
      headers,
      payload: {
        text: "The team made a financial goal this quarter in the market",
        rules: [
          { label: "finance", keywords: ["financial", "market"] },
          { label: "sports", keywords: ["team", "goal"] },
        ],
        multiLabel: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.labels.length).toBe(2);
    const labels = body.data.labels.map((l: { label: string }) => l.label);
    expect(labels).toContain("finance");
    expect(labels).toContain("sports");
  });

  it("single label mode returns only best match", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/classify/classify",
      headers,
      payload: {
        text: "The team scored a goal in the financial market",
        rules: [
          { label: "finance", keywords: ["financial", "market"] },
          { label: "sports", keywords: ["team", "goal"] },
        ],
        multiLabel: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.labels.length).toBe(1);
  });

  it("pattern-based matching works", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/classify/classify",
      headers,
      payload: {
        text: "Order #12345 was shipped on 2024-01-15",
        rules: [
          { label: "order", patterns: ["#\\d+"] },
          { label: "date", patterns: ["\\d{4}-\\d{2}-\\d{2}"] },
        ],
        multiLabel: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const labels = body.data.labels.map((l: { label: string }) => l.label);
    expect(labels).toContain("order");
    expect(labels).toContain("date");
  });

  it("returns 400 for invalid regex pattern", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/classify/classify",
      headers,
      payload: {
        text: "test input",
        rules: [{ label: "bad", patterns: ["[invalid("] }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns empty labels when no rules match", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/classify/classify",
      headers,
      payload: {
        text: "completely unrelated text about cooking recipes",
        rules: [
          { label: "tech", keywords: ["javascript", "python", "code"], minScore: 0.01 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.labels.length).toBe(0);
    expect(body.data.bestMatch).toBeNull();
  });

  it("minScore filters low-confidence results", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/classify/classify",
      headers,
      payload: {
        text: "a very long text with many words but only one keyword tech appears once among dozens of other words that dilute the score significantly",
        rules: [
          { label: "tech", keywords: ["tech"], minScore: 0.5 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Score would be 1/N where N is word count, which is very low — below 0.5
    expect(body.data.labels.length).toBe(0);
  });
});
