import type { FastifyInstance } from "fastify";
import { z } from "zod";
import sharp from "sharp";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const resizeSchema = z.object({
  width: z.coerce.number().int().min(1).max(10000),
  height: z.coerce.number().int().min(1).max(10000).optional(),
  fit: z.enum(["cover", "contain", "fill", "inside", "outside"]).default("cover"),
  format: z.enum(["jpeg", "png", "webp", "avif"]).default("webp"),
  quality: z.coerce.number().int().min(1).max(100).default(80),
});

const compressSchema = z.object({
  quality: z.coerce.number().int().min(1).max(100).default(80),
  format: z.enum(["jpeg", "png", "webp", "avif"]).default("webp"),
});

const convertSchema = z.object({
  format: z.enum(["jpeg", "png", "webp", "avif"]),
  quality: z.coerce.number().int().min(1).max(100).default(80),
});

const watermarkSchema = z.object({
  text: z.string().min(1).max(200),
  position: z.enum(["center", "top-left", "top-right", "bottom-left", "bottom-right"]).default("bottom-right"),
  opacity: z.coerce.number().min(0.1).max(1).default(0.5),
  fontSize: z.coerce.number().int().min(8).max(200).default(24),
});

export async function imageRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/image/resize
  app.post("/resize", async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError("No image file provided");

    const buffer = await file.toBuffer();
    const params = resizeSchema.parse(request.query);

    const processed = await sharp(buffer)
      .resize(params.width, params.height, { fit: params.fit })
      .toFormat(params.format, { quality: params.quality })
      .toBuffer();

    const metadata = await sharp(processed).metadata();

    void reply
      .header("content-type", `image/${params.format}`)
      .header("x-image-width", String(metadata.width ?? 0))
      .header("x-image-height", String(metadata.height ?? 0))
      .header("x-image-size", String(processed.byteLength))
      .send(processed);
  });

  // POST /v1/image/compress
  app.post("/compress", async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError("No image file provided");

    const buffer = await file.toBuffer();
    const params = compressSchema.parse(request.query);
    const originalSize = buffer.byteLength;

    const processed = await sharp(buffer)
      .toFormat(params.format, { quality: params.quality })
      .toBuffer();

    void reply
      .header("content-type", `image/${params.format}`)
      .header("x-original-size", String(originalSize))
      .header("x-compressed-size", String(processed.byteLength))
      .header("x-compression-ratio", (originalSize / processed.byteLength).toFixed(2))
      .send(processed);
  });

  // POST /v1/image/convert
  app.post("/convert", async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError("No image file provided");

    const buffer = await file.toBuffer();
    const params = convertSchema.parse(request.query);

    const processed = await sharp(buffer)
      .toFormat(params.format, { quality: params.quality })
      .toBuffer();

    void reply
      .header("content-type", `image/${params.format}`)
      .send(processed);
  });

  // POST /v1/image/watermark
  app.post("/watermark", async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError("No image file provided");

    const buffer = await file.toBuffer();
    const body = request.body as Record<string, unknown>;
    const params = watermarkSchema.parse({
      text: (body as Record<string, { value?: string }>)?.text?.value ?? (request.query as Record<string, string>)?.text,
      position: (body as Record<string, { value?: string }>)?.position?.value ?? (request.query as Record<string, string>)?.position,
      opacity: (body as Record<string, { value?: string }>)?.opacity?.value ?? (request.query as Record<string, string>)?.opacity,
      fontSize: (body as Record<string, { value?: string }>)?.fontSize?.value ?? (request.query as Record<string, string>)?.fontSize,
    });

    const metadata = await sharp(buffer).metadata();
    const width = metadata.width ?? 800;
    const height = metadata.height ?? 600;

    const svgText = `
      <svg width="${width}" height="${height}">
        <style>
          .watermark { fill: rgba(255,255,255,${params.opacity}); font-size: ${params.fontSize}px; font-family: sans-serif; }
        </style>
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" class="watermark">${escapeXml(params.text)}</text>
      </svg>
    `;

    const processed = await sharp(buffer)
      .composite([{ input: Buffer.from(svgText), gravity: positionToGravity(params.position) }])
      .toBuffer();

    void reply
      .header("content-type", `image/${metadata.format ?? "png"}`)
      .send(processed);
  });

  // POST /v1/image/metadata
  app.post("/metadata", async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError("No image file provided");

    const buffer = await file.toBuffer();
    const metadata = await sharp(buffer).metadata();

    sendSuccess(reply, {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      channels: metadata.channels,
      size: buffer.byteLength,
      hasAlpha: metadata.hasAlpha,
      density: metadata.density,
    });
  });
}

function positionToGravity(position: string): string {
  const map: Record<string, string> = {
    "center": "centre",
    "top-left": "northwest",
    "top-right": "northeast",
    "bottom-left": "southwest",
    "bottom-right": "southeast",
  };
  return map[position] ?? "southeast";
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
