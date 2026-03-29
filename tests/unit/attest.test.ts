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

describe("Attest API", () => {
  it("POST /v1/attest/sign creates a signature", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/attest/sign", headers,
      payload: { data: "hello world", key: "secret-key" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.signature).toBeTruthy();
    expect(body.data.algorithm).toBe("hmac-sha256");
  });

  it("POST /v1/attest/verify validates correct signature", async () => {
    // First sign
    const signRes = await app.inject({
      method: "POST", url: "/v1/attest/sign", headers,
      payload: { data: "test data", key: "my-key" },
    });
    const { signature } = JSON.parse(signRes.body).data;

    // Then verify
    const verifyRes = await app.inject({
      method: "POST", url: "/v1/attest/verify", headers,
      payload: { data: "test data", signature, key: "my-key" },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(JSON.parse(verifyRes.body).data.valid).toBe(true);
  });

  it("POST /v1/attest/verify rejects wrong signature", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/attest/verify", headers,
      payload: {
        data: "test data",
        signature: "0".repeat(64),
        key: "my-key",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.valid).toBe(false);
  });

  it("POST /v1/attest/sign supports sha512 algorithm", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/attest/sign", headers,
      payload: { data: "hello", key: "key", algorithm: "sha512" },
    });
    const body = JSON.parse(res.body);
    expect(body.data.algorithm).toBe("hmac-sha512");
    expect(body.data.signature.length).toBe(128); // sha512 hex = 128 chars
  });

  it("POST /v1/attest/sign returns 400 for missing data", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/attest/sign", headers,
      payload: { key: "secret" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/attest/sign returns 401 without api-key", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/attest/sign",
      payload: { data: "hello", key: "secret" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/attest/sign same input produces same signature (deterministic)", async () => {
    const payload = { data: "deterministic", key: "fixed-key" };
    const res1 = await app.inject({ method: "POST", url: "/v1/attest/sign", headers, payload });
    const res2 = await app.inject({ method: "POST", url: "/v1/attest/sign", headers, payload });
    expect(JSON.parse(res1.body).data.signature).toBe(JSON.parse(res2.body).data.signature);
  });

  it("POST /v1/attest/verify returns 400 for missing fields", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/attest/verify", headers,
      payload: { data: "hello" },
    });
    expect(res.statusCode).toBe(400);
  });
});
