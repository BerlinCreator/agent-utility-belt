import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Redact API — POST /v1/redact/process", () => {
  it("redacts email addresses", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/redact/process",
      headers,
      payload: { text: "Contact me at john@example.com for details", types: ["email"] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.redacted).not.toContain("john@example.com");
    expect(body.data.redacted).toContain("[REDACTED]");
    expect(body.data.totalRedactions).toBe(1);
    expect(body.data.findings[0].type).toBe("email");
  });

  it("redacts phone numbers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/redact/process",
      headers,
      payload: { text: "Call me at 555-123-4567 anytime", types: ["phone"] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.redacted).not.toContain("555-123-4567");
    expect(body.data.totalRedactions).toBe(1);
  });

  it("redacts SSNs", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/redact/process",
      headers,
      payload: { text: "My SSN is 123-45-6789", types: ["ssn"] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.redacted).not.toContain("123-45-6789");
    expect(body.data.totalRedactions).toBe(1);
  });

  it("redacts multiple PII types at once", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/redact/process",
      headers,
      payload: {
        text: "Email: bob@test.com, SSN: 111-22-3333, Phone: 555-867-5309",
        types: ["email", "ssn", "phone"],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.totalRedactions).toBe(3);
    expect(body.data.findings.length).toBe(3);
  });

  it("uses custom replacement string", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/redact/process",
      headers,
      payload: { text: "Email: foo@bar.com", types: ["email"], replacement: "***" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.redacted).toContain("***");
    expect(body.data.redacted).not.toContain("[REDACTED]");
  });

  it("hashReplace mode returns base64 tokens", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/redact/process",
      headers,
      payload: { text: "Email: foo@bar.com", types: ["email"], hashReplace: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.redacted).toMatch(/\[EMAIL_[A-Za-z0-9+/=]+\]/);
    expect(body.data.redacted).not.toContain("foo@bar.com");
  });

  it("returns unchanged text with totalRedactions:0 when no PII found", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/redact/process",
      headers,
      payload: { text: "Nothing sensitive here", types: ["email"] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.redacted).toBe("Nothing sensitive here");
    expect(body.data.totalRedactions).toBe(0);
  });

  it("returns 400 for empty text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/redact/process",
      headers,
      payload: { text: "", types: ["email"] },
    });
    expect(res.statusCode).toBe(400);
  });
});
