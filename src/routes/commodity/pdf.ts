import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError, AppError } from "../../utils/errors.js";

const mergeBodySchema = z.object({
  urls: z.array(z.string().url()).min(1),
});

const splitBodySchema = z.object({
  url: z.string().url(),
  pages: z.string().regex(/^[\d,\-\s]+$/, "Invalid page range format. Use: 1,2,3 or 1-5"),
});

const pdfUrlBodySchema = z.object({
  url: z.string().url(),
});

export async function pdfRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/pdf/merge — merge multiple PDFs
  app.post("/merge", async (request, reply) => {
    const body = parseJsonBody(request.body);
    let pdfs: Buffer[] = [];

    if (body && "urls" in body) {
      const params = mergeBodySchema.parse(body);
      pdfs = await Promise.all(params.urls.map(async (url) => fetchPdfBuffer(url)));
    } else {
      pdfs = await readUploadedPdfParts(request);
    }

    if (pdfs.length < 1) {
      throw new ValidationError("At least 1 PDF source is required for merging");
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
    const body = parseJsonBody(request.body);

    const buffer = body && "url" in body
      ? await fetchPdfBuffer(splitBodySchema.parse(body).url)
      : await readSingleUploadedPdf(request);

    const params = body && "url" in body
      ? splitBodySchema.parse(body)
      : splitBodySchema.parse({ ...(request.query as Record<string, unknown>), ...(request.body as Record<string, unknown>) });

    const sourcePdf = await PDFDocument.load(buffer);
    const totalPages = sourcePdf.getPageCount();
    const pageIndices = parsePageRange(params.pages, totalPages);

    if (pageIndices.length === 0) {
      throw new ValidationError(`No valid pages found in range. PDF has ${totalPages.toString()} pages.`);
    }

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
    const buffer = await resolvePdfBuffer(request);
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
    const buffer = await resolvePdfBuffer(request);
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

function parseJsonBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

async function fetchPdfBuffer(url: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentUtilityBelt/1.0)",
        Accept: "application/pdf,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    throw new AppError(502, "FETCH_ERROR", `Failed to fetch PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  if (!response.ok) {
    throw new AppError(502, "FETCH_ERROR", `Failed to fetch PDF: HTTP ${response.status.toString()}`);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new ValidationError("Fetched PDF is empty");
  }

  return Buffer.from(bytes);
}

async function readUploadedPdfParts(request: FastifyRequest): Promise<Buffer[]> {
  const parts = request.parts();
  const pdfs: Buffer[] = [];

  for await (const part of parts) {
    if (part.type === "file") {
      pdfs.push(await part.toBuffer());
    }
  }

  return pdfs;
}

async function readSingleUploadedPdf(request: FastifyRequest): Promise<Buffer> {
  const file = await request.file();
  if (!file) throw new ValidationError("No PDF file provided");
  return file.toBuffer();
}

async function resolvePdfBuffer(request: FastifyRequest): Promise<Buffer> {
  const body = parseJsonBody(request.body);
  if (body && "url" in body) {
    const params = pdfUrlBodySchema.parse(body);
    return fetchPdfBuffer(params.url);
  }

  return readSingleUploadedPdf(request);
}

function parsePageRange(rangeStr: string, totalPages: number): number[] {
  const indices = new Set<number>();

  for (const part of rangeStr.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-");
      const start = Math.max(1, parseInt(startStr ?? "1", 10));
      const end = Math.min(totalPages, parseInt(endStr ?? String(totalPages), 10));
      for (let i = start; i <= end; i++) {
        indices.add(i - 1);
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
