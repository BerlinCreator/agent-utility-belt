import type { FastifyInstance } from "fastify";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

interface OcrItem {
  description: string;
  amount: string;
}

interface OcrResult {
  vendor: string | null;
  date: string | null;
  total: string | null;
  currency: string | null;
  items: OcrItem[];
  rawText: string;
}

function extractDateFromText(text: string): string | null {
  const patterns = [
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/,
    /\b(\d{1,2}-\d{1,2}-\d{2,4})\b/,
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i,
    /\b(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1]!;
  }
  return null;
}

function extractTotalFromText(text: string): { total: string | null; currency: string | null } {
  const totalPatterns = [
    /(?:total|grand\s+total|amount\s+due|balance\s+due|total\s+amount)[:\s]*([£$€¥₹])\s*([\d,]+\.?\d*)/i,
    /(?:total|grand\s+total|amount\s+due|balance\s+due|total\s+amount)[:\s]*([\d,]+\.?\d*)\s*([£$€¥₹])/i,
    /(?:total|grand\s+total|amount\s+due)[:\s]*([\d,]+\.?\d*)/i,
  ];

  const currencyMap: Record<string, string> = { "$": "USD", "£": "GBP", "€": "EUR", "¥": "JPY", "₹": "INR" };

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      // Check which group has the currency symbol
      if (match[1] && currencyMap[match[1]]) {
        return { total: match[2]!, currency: currencyMap[match[1]]! };
      }
      if (match[2] && currencyMap[match[2]]) {
        return { total: match[1]!, currency: currencyMap[match[2]]! };
      }
      return { total: match[1]!, currency: null };
    }
  }
  return { total: null, currency: null };
}

function extractVendorFromText(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // Usually the vendor/company name is in the first few lines
  for (const line of lines.slice(0, 5)) {
    // Skip lines that are dates, amounts, addresses, phone numbers
    if (/^\d+[/.-]\d+/.test(line)) continue;
    if (/^[\d(+]/.test(line) && line.length < 20) continue;
    if (/invoice|receipt|bill|order|tax|date/i.test(line)) continue;
    if (line.length >= 2 && line.length <= 100) {
      return line;
    }
  }
  return null;
}

function extractItemsFromText(text: string): OcrItem[] {
  const items: OcrItem[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Look for lines with a description followed by an amount
  const itemPattern = /^(.+?)\s+([\d,]+\.?\d{0,2})$/;

  for (const line of lines) {
    const match = itemPattern.exec(line);
    if (match) {
      const description = match[1]!.trim();
      const amount = match[2]!;
      // Filter out headers, totals, tax lines
      if (/^(item|desc|qty|price|amount|total|subtotal|tax|date|invoice)/i.test(description)) continue;
      if (description.length >= 2 && description.length <= 200) {
        items.push({ description, amount });
      }
    }
  }

  return items.slice(0, 50);
}

async function processImage(buffer: Buffer): Promise<string> {
  // Use sharp to preprocess the image for better text extraction
  const sharp = (await import("sharp")).default;

  // Convert to grayscale, increase contrast
  await sharp(buffer)
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer();

  // Since we don't have a full OCR engine (like Tesseract) installed,
  // we'll do our best with image metadata and return helpful info.
  // In a production setup, you'd integrate with Tesseract.js or a cloud OCR service.

  const metadata = await sharp(buffer).metadata();
  return `[Image: ${metadata.width}x${metadata.height} ${metadata.format}. For full OCR, provide receipt text directly or integrate Tesseract.js]`;
}

export async function ocrRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/ocr/extract
  app.post("/extract", async (request, reply) => {
    const contentType = request.headers["content-type"] ?? "";

    let rawText: string;

    if (contentType.includes("multipart/form-data")) {
      const file = await request.file();
      if (!file) {
        throw new ValidationError("No file uploaded");
      }

      const buffer = await file.toBuffer();
      const mimetype = file.mimetype;

      if (mimetype.startsWith("image/")) {
        rawText = await processImage(buffer);
      } else if (mimetype === "text/plain") {
        rawText = buffer.toString("utf-8");
      } else {
        throw new ValidationError(`Unsupported file type: ${mimetype}. Upload an image or text file.`);
      }
    } else {
      // Accept JSON body with text for manual input
      const body = request.body as Record<string, unknown> | null;
      if (!body || typeof body["text"] !== "string") {
        throw new ValidationError("Provide a file upload or JSON body with 'text' field");
      }
      rawText = body["text"] as string;
    }

    const date = extractDateFromText(rawText);
    const { total, currency } = extractTotalFromText(rawText);
    const vendor = extractVendorFromText(rawText);
    const items = extractItemsFromText(rawText);

    const result: OcrResult = {
      vendor,
      date,
      total,
      currency,
      items,
      rawText: rawText.substring(0, 5000),
    };

    sendSuccess(reply, result);
  });
}
