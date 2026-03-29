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

describe("Entity API", () => {
  it("POST /v1/entity/extract finds emails", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/entity/extract", headers,
      payload: { text: "Contact us at hello@example.com for info" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.entities.some((e: { type: string }) => e.type === "email")).toBe(true);
    expect(body.data.count).toBeGreaterThan(0);
  });

  it("POST /v1/entity/extract finds URLs", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/entity/extract", headers,
      payload: { text: "Visit https://example.com for details" },
    });
    const body = JSON.parse(res.body);
    expect(body.data.entities.some((e: { type: string }) => e.type === "url")).toBe(true);
  });

  it("POST /v1/entity/extract finds phone numbers", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/entity/extract", headers,
      payload: { text: "Call us at +1-555-123-4567" },
    });
    const body = JSON.parse(res.body);
    expect(body.data.entities.some((e: { type: string }) => e.type === "phone")).toBe(true);
  });

  it("POST /v1/entity/extract finds multiple entity types", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/entity/extract", headers,
      payload: { text: "Email test@test.com, visit https://test.com, price $100.00, 50%" },
    });
    const body = JSON.parse(res.body);
    expect(body.data.count).toBeGreaterThanOrEqual(4);
    expect(Object.keys(body.data.types).length).toBeGreaterThanOrEqual(3);
  });

  it("POST /v1/entity/extract returns empty for no entities", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/entity/extract", headers,
      payload: { text: "This is a plain text with nothing special" },
    });
    const body = JSON.parse(res.body);
    expect(body.data.count).toBe(0);
    expect(body.data.entities).toHaveLength(0);
  });

  it("POST /v1/entity/extract returns 400 for empty text", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/entity/extract", headers,
      payload: { text: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/entity/extract returns 401 without api-key", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/entity/extract",
      payload: { text: "test@test.com" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/entity/extract entities have correct structure", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/entity/extract", headers,
      payload: { text: "Contact: test@example.com" },
    });
    const body = JSON.parse(res.body);
    const entity = body.data.entities[0];
    expect(entity).toHaveProperty("text");
    expect(entity).toHaveProperty("type");
    expect(entity).toHaveProperty("start");
    expect(entity).toHaveProperty("end");
  });
});
