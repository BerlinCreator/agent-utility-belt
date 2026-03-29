import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Form API — POST /v1/form/validate", () => {
  it("validates required fields — missing field returns errors", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/form/validate", headers,
      payload: {
        data: { name: "Alice" },
        rules: [
          { name: "name", type: "string", required: true },
          { name: "email", type: "email", required: true },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.valid).toBe(false);
    expect(body.data.errors).toHaveLength(1);
    expect(body.data.errors[0].field).toBe("email");
  });

  it("validates email field type", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/form/validate", headers,
      payload: {
        data: { email: "not-an-email" },
        rules: [{ name: "email", type: "email", required: true }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.valid).toBe(false);
    expect(body.data.errors[0].error).toContain("valid email");
  });

  it("validates number min/max constraints", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/form/validate", headers,
      payload: {
        data: { age: 150 },
        rules: [{ name: "age", type: "number", required: true, min: 0, max: 120 }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.valid).toBe(false);
    expect(body.data.errors[0].error).toContain("<= 120");
  });

  it("all valid data returns valid:true", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/form/validate", headers,
      payload: {
        data: { name: "Alice", email: "alice@example.com", age: 30 },
        rules: [
          { name: "name", type: "string", required: true },
          { name: "email", type: "email", required: true },
          { name: "age", type: "number", required: true, min: 0, max: 120 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.valid).toBe(true);
    expect(body.data.errors).toHaveLength(0);
    expect(body.data.fieldCount).toBe(3);
  });
});

describe("Form API — POST /v1/form/generate", () => {
  it("generates HTML form with fields", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/form/generate", headers,
      payload: {
        fields: [
          { name: "username", type: "text", label: "Username", required: true },
          { name: "password", type: "password", label: "Password", required: true },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.html).toContain("<form");
    expect(body.data.html).toContain('type="text"');
    expect(body.data.html).toContain('type="password"');
    expect(body.data.fields).toHaveLength(2);
  });

  it("generates select field with options", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/form/generate", headers,
      payload: {
        fields: [
          { name: "color", type: "select", label: "Color", options: ["red", "green", "blue"] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.html).toContain("<select");
    expect(body.data.html).toContain("<option");
    expect(body.data.html).toContain("red");
    expect(body.data.html).toContain("green");
  });

  it("generates textarea field", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/form/generate", headers,
      payload: {
        fields: [
          { name: "bio", type: "textarea", label: "Biography", placeholder: "Tell us about yourself" },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.html).toContain("<textarea");
    expect(body.data.html).toContain("Tell us about yourself");
  });
});
