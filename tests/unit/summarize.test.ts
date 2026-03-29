import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

const sampleText = "The quick brown fox jumps over the lazy dog. Machine learning is transforming industries worldwide. Natural language processing enables computers to understand human text. Deep learning models require large amounts of training data. Artificial intelligence continues to advance rapidly.";

describe("Summarize API — POST /v1/summarize/extract", () => {
  it("extracts top sentences using tfidf algorithm", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/summarize/extract", headers,
      payload: { text: sampleText, sentences: 2, algorithm: "tfidf" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.sentences).toHaveLength(2);
    expect(body.data.summary).toBeTruthy();
  });

  it("frequency algorithm works", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/summarize/extract", headers,
      payload: { text: sampleText, sentences: 2, algorithm: "frequency" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.sentences).toHaveLength(2);
    expect(body.data.summary).toBeTruthy();
  });

  it("respects sentence count parameter", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/summarize/extract", headers,
      payload: { text: sampleText, sentences: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.sentences).toHaveLength(1);
  });

  it("single sentence text returns that sentence", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/summarize/extract", headers,
      payload: { text: "This is the only sentence.", sentences: 3 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.sentences).toHaveLength(1);
    expect(body.data.summary).toContain("This is the only sentence.");
  });

  it("text with no sentences returns 400", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/summarize/extract", headers,
      payload: { text: "   ", sentences: 2 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns compression ratio stats", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/summarize/extract", headers,
      payload: { text: sampleText, sentences: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.stats).toBeDefined();
    expect(body.data.stats.originalSentences).toBe(5);
    expect(body.data.stats.selectedSentences).toBe(2);
    expect(body.data.stats.compressionRatio).toBeCloseTo(0.4);
  });

  it("handles multi-sentence text correctly", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/summarize/extract", headers,
      payload: { text: sampleText, sentences: 3 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.sentences).toHaveLength(3);
    // Sentences should have score and index properties
    for (const s of body.data.sentences) {
      expect(s).toHaveProperty("sentence");
      expect(s).toHaveProperty("score");
      expect(s).toHaveProperty("index");
    }
  });
});
