import type { FastifyInstance } from "fastify";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const generateSchema = z.object({
  template: z.string().min(1).max(10000),
  data: z.record(z.string(), z.unknown()).default({}),
  format: z.enum(["pdf", "docx"]).default("pdf"),
  title: z.string().max(255).optional(),
});

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return data[key] !== undefined ? String(data[key]) : `{{${key}}}`;
  });
}

async function generatePdf(content: string, title?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (title) {
      doc.fontSize(20).text(title, { align: "center" });
      doc.moveDown();
    }

    doc.fontSize(12).text(content, { align: "left" });
    doc.end();
  });
}

async function generateDocx(content: string, title?: string): Promise<Buffer> {
  const paragraphs: Paragraph[] = [];

  if (title) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: title, bold: true, size: 32 })],
      }),
    );
  }

  const lines = content.split("\n");
  for (const line of lines) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: line, size: 24 })],
      }),
    );
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export async function docgenRoutes(app: FastifyInstance): Promise<void> {
  app.post("/generate", async (request, reply) => {
    const body = generateSchema.parse(request.body);
    const content = interpolate(body.template, body.data);

    if (content.trim().length === 0) {
      throw new ValidationError("Template produced empty content after interpolation");
    }

    const buffer = body.format === "pdf"
      ? await generatePdf(content, body.title)
      : await generateDocx(content, body.title);

    const contentType = body.format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    sendSuccess(reply, {
      format: body.format,
      size: buffer.length,
      contentType,
      content: buffer.toString("base64"),
    });
  });
}
