import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

export async function watermarkRoutes(app: FastifyInstance): Promise<void> {
  // POST /image — add text watermark to an image
  app.post("/image", async (request, reply) => {
    const parts = request.parts();
    let imageBuffer: Buffer | null = null;
    let watermarkText = "WATERMARK";
    let opacity = 0.3;
    let position = "center";

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "image") {
        imageBuffer = await part.toBuffer();
      } else if (part.type === "field") {
        if (part.fieldname === "text" && typeof part.value === "string") {
          watermarkText = part.value;
        } else if (part.fieldname === "opacity" && typeof part.value === "string") {
          opacity = Math.max(0.1, Math.min(1, parseFloat(part.value) || 0.3));
        } else if (part.fieldname === "position" && typeof part.value === "string") {
          const validPositions = ["center", "bottom-right", "bottom-left", "top-right", "top-left"];
          if (validPositions.includes(part.value)) {
            position = part.value;
          }
        }
      }
    }

    if (!imageBuffer) {
      throw new ValidationError("Image file is required (field: 'image')");
    }

    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? 800;
    const height = metadata.height ?? 600;

    const fontSize = Math.max(16, Math.floor(Math.min(width, height) / 15));
    const svgOpacity = opacity;

    // Compute watermark position
    let x = width / 2;
    let y = height / 2;
    let anchor = "middle";
    if (position === "bottom-right") { x = width - 20; y = height - 20; anchor = "end"; }
    else if (position === "bottom-left") { x = 20; y = height - 20; anchor = "start"; }
    else if (position === "top-right") { x = width - 20; y = fontSize + 20; anchor = "end"; }
    else if (position === "top-left") { x = 20; y = fontSize + 20; anchor = "start"; }

    const svgOverlay = Buffer.from(
      `<svg width="${width}" height="${height}">
        <text x="${x}" y="${y}" font-size="${fontSize}" fill="white" opacity="${svgOpacity}" text-anchor="${anchor}" font-family="sans-serif">${escapeXml(watermarkText)}</text>
      </svg>`,
    );

    const result = await sharp(imageBuffer)
      .composite([{ input: svgOverlay, top: 0, left: 0 }])
      .png()
      .toBuffer();

    sendSuccess(reply, {
      size: result.length,
      width,
      height,
      watermarkText,
      contentType: "image/png",
      content: result.toString("base64"),
    });
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
