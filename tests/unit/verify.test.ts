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

describe("Verify API", () => {
  it("POST /v1/verify/email validates correct email", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/verify/email", headers,
      payload: { email: "user@example.com" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.valid).toBe(true);
    expect(body.data.normalized).toBe("user@example.com");
  });

  it("POST /v1/verify/email rejects invalid email", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/verify/email", headers,
      payload: { email: "not-an-email" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.valid).toBe(false);
  });

  it("POST /v1/verify/phone validates US number", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/verify/phone", headers,
      payload: { phone: "+12025551234", country: "US" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.valid).toBe(true);
    expect(body.data.e164).toBeTruthy();
  });

  it("POST /v1/verify/phone rejects invalid number", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/verify/phone", headers,
      payload: { phone: "123" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.valid).toBe(false);
  });

  it("POST /v1/verify/address validates complete address", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/verify/address", headers,
      payload: { street: "123 Main Street", city: "Springfield", state: "IL", zip: "62701", country: "US" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.valid).toBe(true);
    expect(body.data.issues).toHaveLength(0);
  });

  it("POST /v1/verify/address flags short street", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/verify/address", headers,
      payload: { street: "ab", city: "Springfield", country: "US" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.valid).toBe(false);
  });

  it("POST /v1/verify/email returns 401 without api-key", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/verify/email",
      payload: { email: "test@test.com" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/verify/email returns 400 for missing email", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/verify/email", headers,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
