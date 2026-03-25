import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as cheerio from "cheerio";
import { sendSuccess } from "../../utils/response.js";
import { AppError } from "../../utils/errors.js";

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  num: z.coerce.number().int().min(1).max(20).default(10),
  country: z.string().length(2).default("us"),
  lang: z.string().min(2).max(5).default("en"),
});

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export async function serpAnalyzerRoutes(app: FastifyInstance): Promise<void> {
  app.post("/search", async (request, reply) => {
    const params = searchSchema.parse(request.body);

    const searchUrl = new URL("https://www.google.com/search");
    searchUrl.searchParams.set("q", params.query);
    searchUrl.searchParams.set("num", params.num.toString());
    searchUrl.searchParams.set("hl", params.lang);
    searchUrl.searchParams.set("gl", params.country);

    let html: string;
    const startTime = Date.now();

    try {
      const response = await fetch(searchUrl.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": `${params.lang},en;q=0.9`,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new AppError(502, "SEARCH_ERROR", `Search engine returned HTTP ${response.status.toString()}`);
      }

      html = await response.text();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "SEARCH_ERROR", `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    const searchTime = Date.now() - startTime;
    const $ = cheerio.load(html);

    const results: SearchResult[] = [];
    let position = 1;

    // Parse Google search result divs
    $("div.g").each((_i, el) => {
      if (position > params.num) return;

      const titleEl = $(el).find("h3").first();
      const linkEl = $(el).find("a").first();
      const snippetEl = $(el).find("div[data-sncf], div.VwiC3b, span.aCOpRe").first();

      const title = titleEl.text().trim();
      const url = linkEl.attr("href") ?? "";
      const snippet = snippetEl.text().trim();

      if (title && url && url.startsWith("http")) {
        results.push({ title, url, snippet, position });
        position++;
      }
    });

    // Fallback: try alternative selectors if no results found
    if (results.length === 0) {
      $("a h3").each((_i, el) => {
        if (position > params.num) return;

        const title = $(el).text().trim();
        const link = $(el).closest("a");
        const url = link.attr("href") ?? "";

        if (title && url.startsWith("http")) {
          results.push({ title, url, snippet: "", position });
          position++;
        }
      });
    }

    const totalResultsText = $("div#result-stats").text();
    const totalResultsMatch = totalResultsText.match(/[\d,]+/);
    const totalResults = totalResultsMatch ? totalResultsMatch[0] : null;

    sendSuccess(reply, {
      query: params.query,
      results,
      totalResults,
      searchTimeMs: searchTime,
      country: params.country,
      lang: params.lang,
    });
  });
}
