import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => { await app.close(); });

describe("DocGen API", () => {
  it("POST /v1/docgen/generate creates a PDF by default", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/docgen/generate",
      headers,
      payload: { template: "Hello {{name}}, welcome!", data: { name: "Agent" } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.format).toBe("pdf");
    expect(body.data.content).toBeTruthy();
    expect(body.data.size).toBeGreaterThan(0);
  });

  it("POST /v1/docgen/generate creates a DOCX", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/docgen/generate",
      headers,
      payload: { template: "Report for {{project}}", data: { project: "Alpha" }, format: "docx" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.format).toBe("docx");
    expect(body.data.contentType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("POST /v1/docgen/generate with title in PDF", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/docgen/generate",
      headers,
      payload: { template: "Content here", title: "My Doc" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.size).toBeGreaterThan(0);
  });

  it("POST /v1/docgen/generate returns 400 for empty template", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/docgen/generate",
      headers,
      payload: { template: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/docgen/generate returns 400 for invalid format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/docgen/generate",
      headers,
      payload: { template: "hello", format: "txt" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/docgen/generate returns 401 without api-key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/docgen/generate",
      payload: { template: "hello" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/docgen/generate interpolates data correctly", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/docgen/generate",
      headers,
      payload: { template: "{{a}} and {{b}}", data: { a: "X", b: "Y" } },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it("POST /v1/docgen/generate handles missing data keys gracefully", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/docgen/generate",
      headers,
      payload: { template: "Hello {{missing}}", data: {} },
    });
    expect(res.statusCode).toBe(200);
  });
});
