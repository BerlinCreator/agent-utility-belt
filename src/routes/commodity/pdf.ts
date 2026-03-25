import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const splitSchema = z.object({
  pages: z.string().regex(/^[\d,\-\s]+$/, "Invalid page range format. Use: 1,2,3 or 1-5"),
});

export async function pdfRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/pdf/merge — merge multiple PDFs
  app.post("/merge", async (request, reply) => {
    const parts = request.parts();
    const pdfs: Buffer[] = [];

    for await (const part of parts) {
      if (part.type === "file") {
        pdfs.push(await part.toBuffer());
      }
    }

    if (pdfs.length < 2) {
      throw new ValidationError("At least 2 PDF files are required for merging");
    }

    const mergedPdf = await PDFDocument.create();

    for (const pdfBuffer of pdfs) {
      const doc = await PDFDocument.load(pdfBuffer);
      const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
      for (const page of pages) {
        mergedPdf.addPage(page);
      }
    }

    const mergedBytes = await mergedPdf.save();

    void reply
      .header("content-type", "application/pdf")
      .header("content-disposition", 'attachment; filename="merged.pdf"')
      .header("x-page-count", String(mergedPdf.getPageCount()))
      .send(Buffer.from(mergedBytes));
  });

  // POST /v1/pdf/split — extract specific pages
  app.post("/split", async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError("No PDF file provided");

    const buffer = await file.toBuffer();
    const params = splitSchema.parse(request.query);

    const sourcePdf = await PDFDocument.load(buffer);
    const totalPages = sourcePdf.getPageCount();
    const pageIndices = parsePageRange(params.pages, totalPages);

    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(sourcePdf, pageIndices);
    for (const page of pages) {
      newPdf.addPage(page);
    }

    const bytes = await newPdf.save();

    void reply
      .header("content-type", "application/pdf")
      .header("content-disposition", 'attachment; filename="split.pdf"')
      .header("x-page-count", String(newPdf.getPageCount()))
      .send(Buffer.from(bytes));
  });

  // POST /v1/pdf/info — get PDF metadata
  app.post("/info", async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError("No PDF file provided");

    const buffer = await file.toBuffer();
    const pdf = await PDFDocument.load(buffer);

    sendSuccess(reply, {
      pageCount: pdf.getPageCount(),
      title: pdf.getTitle(),
      author: pdf.getAuthor(),
      subject: pdf.getSubject(),
      creator: pdf.getCreator(),
      producer: pdf.getProducer(),
      creationDate: pdf.getCreationDate()?.toISOString(),
      modificationDate: pdf.getModificationDate()?.toISOString(),
      sizeBytes: buffer.byteLength,
    });
  });

  // POST /v1/pdf/extract-text — basic text extraction from PDF metadata
  app.post("/extract-text", async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError("No PDF file provided");

    const buffer = await file.toBuffer();
    const pdf = await PDFDocument.load(buffer);

    // pdf-lib doesn't support text extraction natively
    // Return metadata-based info; full text extraction requires a heavier lib
    sendSuccess(reply, {
      pageCount: pdf.getPageCount(),
      title: pdf.getTitle() ?? null,
      author: pdf.getAuthor() ?? null,
      note: "Full text extraction requires the premium tier. This endpoint returns PDF metadata.",
    });
  });
}

function parsePageRange(rangeStr: string, totalPages: number): number[] {
  const indices = new Set<number>();

  for (const part of rangeStr.split(",")) {
    const trimmed = part.trim();
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-");
      const start = Math.max(1, parseInt(startStr ?? "1", 10));
      const end = Math.min(totalPages, parseInt(endStr ?? String(totalPages), 10));
      for (let i = start; i <= end; i++) {
        indices.add(i - 1); // 0-indexed
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (page >= 1 && page <= totalPages) {
        indices.add(page - 1);
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}
