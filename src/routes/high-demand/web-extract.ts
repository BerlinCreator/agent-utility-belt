import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as cheerio from "cheerio";
import { sendSuccess } from "../../utils/response.js";
import { AppError } from "../../utils/errors.js";

const extractSchema = z.object({
  url: z.string().url(),
  selectors: z.array(z.string()).optional(),
  format: z.enum(["text", "html", "json"]).default("json"),
});

export async function webExtractRoutes(app: FastifyInstance): Promise<void> {
  app.post("/extract", async (request, reply) => {
    const params = extractSchema.parse(request.body);

    let html: string;
    try {
      const response = await fetch(params.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgentUtilityBelt/1.0)",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new AppError(502, "FETCH_ERROR", `Failed to fetch URL: HTTP ${response.status.toString()}`);
      }

      html = await response.text();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "FETCH_ERROR", `Failed to fetch URL: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    const $ = cheerio.load(html);

    // Remove script and style tags for cleaner extraction
    $("script, style, noscript").remove();

    const title = $("title").text().trim() || $('meta[property="og:title"]').attr("content") || null;
    const description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      null;

    const metadata: Record<string, string> = {};
    $("meta").each((_i, el) => {
      const name = $(el).attr("name") || $(el).attr("property");
      const content = $(el).attr("content");
      if (name && content) {
        metadata[name] = content;
      }
    });

    const links: string[] = [];
    $("a[href]").each((_i, el) => {
      const href = $(el).attr("href");
      if (href && href.startsWith("http")) {
        links.push(href);
      }
    });

    const images: string[] = [];
    $("img[src]").each((_i, el) => {
      const src = $(el).attr("src");
      if (src) {
        images.push(src);
      }
    });

    let content: string;
    if (params.selectors && params.selectors.length > 0) {
      const selectorResults: Record<string, string> = {};
      for (const selector of params.selectors) {
        selectorResults[selector] = params.format === "html"
          ? $(selector).html() ?? ""
          : $(selector).text().trim();
      }
      content = JSON.stringify(selectorResults);
    } else {
      content = params.format === "html"
        ? $("body").html() ?? ""
        : $("body").text().replace(/\s+/g, " ").trim();
    }

    sendSuccess(reply, {
      url: params.url,
      title,
      description,
      content: content.slice(0, 50000), // Cap content size
      links: [...new Set(links)].slice(0, 100),
      images: [...new Set(images)].slice(0, 50),
      metadata,
    });
  });
}
