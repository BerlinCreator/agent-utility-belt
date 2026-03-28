import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";
import { db } from "../../src/db/connection.js";
import { PDFDocument } from "pdf-lib";

let app: FastifyInstance;

function mockValidApiKey() {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{
          id: "test-key-id",
          userId: "test-user-id",
          key: "valid-test-key",
          tier: "free",
          isActive: true,
          callsThisMonth: 0,
          monthlyLimit: 100,
          createdAt: new Date(),
          expiresAt: null,
        }]),
      }),
    }),
  } as ReturnType<typeof db.select>);

  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  } as ReturnType<typeof db.update>);
}

async function createPdf(pageCount: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdf.addPage([400, 400]);
  }
  return pdf.save();
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  mockValidApiKey();
});

describe("PDF API", () => {
  it("should return info for a JSON body with url", async () => {
    const pdfBytes = await createPdf(2);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/pdf/info",
      headers: { "x-api-key": "valid-test-key" },
      payload: { url: "https://example.com/sample.pdf" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.pageCount).toBe(2);

    globalThis.fetch = originalFetch;
  });

  it("should split a PDF from JSON body", async () => {
    const pdfBytes = await createPdf(3);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/pdf/split",
      headers: { "x-api-key": "valid-test-key" },
      payload: { url: "https://example.com/sample.pdf", pages: "1,3" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-page-count"]).toBe("2");
    expect(response.headers["content-type"]).toContain("application/pdf");

    globalThis.fetch = originalFetch;
  });
});
