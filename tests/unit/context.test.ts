import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Context API — POST /v1/context/truncate", () => {
  it("text within limit is not truncated", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/context/truncate", headers,
      payload: { text: "Short text.", maxTokens: 100 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.truncated).toBe(false);
    expect(body.data.text).toBe("Short text.");
  });

  it("text exceeding limit is truncated with ellipsis (end strategy)", async () => {
    const longText = "a".repeat(200);
    const res = await app.inject({
      method: "POST", url: "/v1/context/truncate", headers,
      payload: { text: longText, maxTokens: 10, strategy: "end" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.truncated).toBe(true);
    expect(body.data.text).toContain("...");
    expect(body.data.text.length).toBeLessThan(longText.length);
  });

  it("start strategy truncates from start", async () => {
    const longText = "START" + "x".repeat(200) + "END";
    const res = await app.inject({
      method: "POST", url: "/v1/context/truncate", headers,
      payload: { text: longText, maxTokens: 10, strategy: "start" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.truncated).toBe(true);
    expect(body.data.text).toContain("...");
    // Start strategy keeps the end of text
    expect(body.data.text).toContain("END");
  });

  it("middle strategy keeps both ends", async () => {
    const longText = "BEGIN" + "x".repeat(200) + "FINAL";
    const res = await app.inject({
      method: "POST", url: "/v1/context/truncate", headers,
      payload: { text: longText, maxTokens: 10, strategy: "middle" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.truncated).toBe(true);
    expect(body.data.text).toContain("...");
    // Middle strategy keeps beginning and end
    expect(body.data.text).toContain("BEGIN");
    expect(body.data.text).toContain("FINAL");
  });
});

describe("Context API — POST /v1/context/count", () => {
  it("counts tokens", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/context/count", headers,
      payload: { text: "Hello world, this is a test.", unit: "tokens" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.count).toBeGreaterThan(0);
    expect(body.data.unit).toBe("tokens");
  });

  it("counts words", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/context/count", headers,
      payload: { text: "one two three four five", unit: "words" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.count).toBe(5);
    expect(body.data.unit).toBe("words");
  });

  it("counts lines", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/context/count", headers,
      payload: { text: "line1\nline2\nline3", unit: "lines" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.count).toBe(3);
    expect(body.data.unit).toBe("lines");
  });
});

describe("Context API — POST /v1/context/slice", () => {
  it("slices text by token range", async () => {
    // Each token ~4 chars; startToken=2 means start at char 8, endToken=5 means end at char 20
    const text = "abcdefghijklmnopqrstuvwxyz0123456789";
    const res = await app.inject({
      method: "POST", url: "/v1/context/slice", headers,
      payload: { text, startToken: 2, endToken: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.text).toBe(text.slice(8, 20));
    expect(body.data.startToken).toBe(2);
    expect(body.data.endToken).toBe(5);
    expect(body.data.tokens).toBeGreaterThan(0);
  });
});
