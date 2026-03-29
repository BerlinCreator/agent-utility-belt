import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Convert API — POST /v1/convert/transform", () => {
  it("converts CSV to JSON", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/convert/transform", headers,
      payload: { input: "name,age\nAlice,30\nBob,25", from: "csv", to: "json" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const output = JSON.parse(body.data.output);
    expect(output).toHaveLength(2);
    expect(output[0].name).toBe("Alice");
    expect(output[1].age).toBe("25");
  });

  it("converts JSON to CSV", async () => {
    const input = JSON.stringify([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
    const res = await app.inject({
      method: "POST", url: "/v1/convert/transform", headers,
      payload: { input, from: "json", to: "csv" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.output).toContain("name");
    expect(body.data.output).toContain("Alice");
  });

  it("converts YAML to JSON", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/convert/transform", headers,
      payload: { input: "name: Alice\nage: 30", from: "yaml", to: "json" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const output = JSON.parse(body.data.output);
    expect(output.name).toBe("Alice");
    expect(output.age).toBe(30);
  });

  it("converts JSON to YAML", async () => {
    const input = JSON.stringify({ name: "Alice", age: 30 });
    const res = await app.inject({
      method: "POST", url: "/v1/convert/transform", headers,
      payload: { input, from: "json", to: "yaml" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.output).toContain("name: Alice");
    expect(body.data.output).toContain("age: 30");
  });

  it("converts Markdown to HTML", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/convert/transform", headers,
      payload: { input: "# Hello\n\nThis is **bold**.", from: "markdown", to: "html" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.output).toContain("<h1>");
    expect(body.data.output).toContain("<strong>bold</strong>");
  });

  it("converts HTML to Markdown", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/convert/transform", headers,
      payload: { input: "<h1>Hello</h1><p>This is <strong>bold</strong>.</p>", from: "html", to: "markdown" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.output).toContain("Hello");
    expect(body.data.output).toContain("**bold**");
  });

  it("returns 400 for unsupported conversion (csv to html)", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/convert/transform", headers,
      payload: { input: "name,age\nAlice,30", from: "csv", to: "html" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for empty input", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/convert/transform", headers,
      payload: { input: "", from: "csv", to: "json" },
    });
    expect(res.statusCode).toBe(400);
  });
});
