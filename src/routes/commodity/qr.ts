import type { FastifyInstance } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import bwipjs from "bwip-js";
import { sendSuccess } from "../../utils/response.js";

const qrGenerateSchema = z.object({
  data: z.string().min(1).max(4296),
  size: z.coerce.number().int().min(100).max(2000).default(300),
  format: z.enum(["png", "svg"]).default("png"),
  errorCorrection: z.enum(["L", "M", "Q", "H"]).default("M"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
});

const barcodeGenerateSchema = z.object({
  data: z.string().min(1).max(500),
  type: z.enum([
    "code128", "code39", "ean13", "ean8", "upca", "upce",
    "itf14", "isbn", "issn", "datamatrix",
  ]).default("code128"),
  scale: z.coerce.number().int().min(1).max(10).default(3),
  height: z.coerce.number().int().min(10).max(500).default(80),
  includetext: z.coerce.boolean().default(true),
});

export async function qrRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/qr/generate
  app.post("/generate", async (request, reply) => {
    const params = qrGenerateSchema.parse(request.body);

    if (params.format === "svg") {
      const svg = await QRCode.toString(params.data, {
        type: "svg",
        width: params.size,
        errorCorrectionLevel: params.errorCorrection,
        color: {
          dark: params.color,
          light: params.background,
        },
      });
      void reply.header("content-type", "image/svg+xml").send(svg);
      return;
    }

    const buffer = await QRCode.toBuffer(params.data, {
      width: params.size,
      errorCorrectionLevel: params.errorCorrection,
      color: {
        dark: params.color,
        light: params.background,
      },
    });

    void reply.header("content-type", "image/png").send(buffer);
  });

  // POST /v1/qr/barcode
  app.post("/barcode", async (request, reply) => {
    const params = barcodeGenerateSchema.parse(request.body);

    const buffer = await bwipjs.toBuffer({
      bcid: params.type,
      text: params.data,
      scale: params.scale,
      height: params.height / 10, // bwip-js uses mm
      includetext: params.includetext,
    });

    void reply.header("content-type", "image/png").send(buffer);
  });

  // POST /v1/qr/decode — decode QR from JSON (base64 image)
  app.post("/decode", async (request, reply) => {
    const body = z.object({ image: z.string().min(1) }).parse(request.body);

    // Decode base64 image
    const imageBuffer = Buffer.from(body.image, "base64");

    // Use sharp to get raw pixel data for jsqr
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const jsqrModule = await import("jsqr");
    const jsQR = (jsqrModule.default ?? jsqrModule) as unknown as (data: Uint8ClampedArray, width: number, height: number) => { data: string; location: unknown } | null;
    const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);

    if (!result) {
      sendSuccess(reply, { decoded: false, data: null });
      return;
    }

    sendSuccess(reply, {
      decoded: true,
      data: result.data,
      location: result.location,
    });
  });
}
