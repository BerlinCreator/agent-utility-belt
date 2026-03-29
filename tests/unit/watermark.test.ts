import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

async function createTestImage(width = 200, height = 100): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => { await app.close(); });

describe("Watermark API", () => {
  it("POST /v1/watermark/image adds watermark to image", async () => {
    const imageBuffer = await createTestImage();
    const form = new FormData();
    form.append("image", new Blob([imageBuffer], { type: "image/png" }), "test.png");
    form.append("text", "CONFIDENTIAL");

    const res = await app.inject({
      method: "POST",
      url: "/v1/watermark/image",
      headers: { ...headers, "content-type": "multipart/form-data" },
      payload: form,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.content).toBeTruthy();
    expect(body.data.watermarkText).toBe("CONFIDENTIAL");
  });

  it("POST /v1/watermark/image uses default watermark text", async () => {
    const imageBuffer = await createTestImage();
    const form = new FormData();
    form.append("image", new Blob([imageBuffer], { type: "image/png" }), "test.png");

    const res = await app.inject({
      method: "POST",
      url: "/v1/watermark/image",
      headers: { ...headers, "content-type": "multipart/form-data" },
      payload: form,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.watermarkText).toBe("WATERMARK");
  });

  it("POST /v1/watermark/image returns correct dimensions", async () => {
    const imageBuffer = await createTestImage(400, 300);
    const form = new FormData();
    form.append("image", new Blob([imageBuffer], { type: "image/png" }), "test.png");

    const res = await app.inject({
      method: "POST",
      url: "/v1/watermark/image",
      headers: { ...headers, "content-type": "multipart/form-data" },
      payload: form,
    });
    const body = JSON.parse(res.body);
    expect(body.data.width).toBe(400);
    expect(body.data.height).toBe(300);
  });

  it("POST /v1/watermark/image returns 400 without image file", async () => {
    const form = new FormData();
    form.append("text", "WATERMARK");

    const res = await app.inject({
      method: "POST",
      url: "/v1/watermark/image",
      headers: { ...headers, "content-type": "multipart/form-data" },
      payload: form,
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/watermark/image returns 401 without api-key", async () => {
    const imageBuffer = await createTestImage();
    const form = new FormData();
    form.append("image", new Blob([imageBuffer], { type: "image/png" }), "test.png");

    const res = await app.inject({
      method: "POST",
      url: "/v1/watermark/image",
      payload: form,
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/watermark/image output is base64-encoded PNG", async () => {
    const imageBuffer = await createTestImage();
    const form = new FormData();
    form.append("image", new Blob([imageBuffer], { type: "image/png" }), "test.png");

    const res = await app.inject({
      method: "POST",
      url: "/v1/watermark/image",
      headers: { ...headers, "content-type": "multipart/form-data" },
      payload: form,
    });
    const body = JSON.parse(res.body);
    expect(body.data.contentType).toBe("image/png");
    // Verify the base64 can be decoded
    const decoded = Buffer.from(body.data.content, "base64");
    expect(decoded.length).toBeGreaterThan(0);
  });
});
