import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  country: z.string().max(10).optional(),
});

interface PatentResult {
  title: string;
  patentNumber: string;
  abstract: string;
  assignee: string;
  filingDate: string;
  url: string;
}

export async function patentSearchRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/patents/search
  app.post("/search", async (request, reply) => {
    const { query, limit, country } = searchSchema.parse(request.body);

    let searchUrl = `https://patents.google.com/xhr/query?url=q%3D${encodeURIComponent(query)}`;
    if (country) {
      searchUrl += `%26country%3D${encodeURIComponent(country)}`;
    }
    searchUrl += `&num=${limit}&exp=`;

    let html: string;
    try {
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgentUtilityBelt/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`Google Patents returned ${response.status}`);
      }

      html = await response.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      throw new ValidationError(`Patent search failed: ${message}`);
    }

    // Parse results from the response using regex (simpler than full cheerio for XHR responses)
    const results: PatentResult[] = [];
    const { load } = await import("cheerio");
    const $ = load(html);

    $("search-result-item, .result-item, article").each((_i, elem) => {
      if (results.length >= limit) return;

      const $el = $(elem);
      const title = $el.find(".result-title, h3, .patent-title").text().trim();
      const patentNumber = $el.find(".patent-number, .style-scope.search-result-item").first().text().trim();
      const abstract = $el.find(".result-snippet, .abstract, p").first().text().trim();
      const assignee = $el.find(".assignee, .result-assignee").text().trim();
      const filingDate = $el.find(".filing-date, .result-date").text().trim();

      if (title) {
        results.push({
          title,
          patentNumber: patentNumber || "N/A",
          abstract: abstract.substring(0, 500),
          assignee: assignee || "Unknown",
          filingDate: filingDate || "Unknown",
          url: patentNumber
            ? `https://patents.google.com/patent/${patentNumber}`
            : `https://patents.google.com/?q=${encodeURIComponent(query)}`,
        });
      }
    });

    sendSuccess(reply, {
      query,
      country: country ?? null,
      total: results.length,
      results,
    });
  });
}
