import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as cheerio from "cheerio";
import { sendSuccess } from "../../utils/response.js";
import { AppError } from "../../utils/errors.js";

const fetchReviewsSchema = z.object({
  url: z.string().url(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

interface Review {
  author: string | null;
  rating: number | null;
  title: string | null;
  content: string;
  date: string | null;
}

interface ReviewResult {
  url: string;
  product: string | null;
  totalReviews: string | null;
  averageRating: string | null;
  reviews: Review[];
}

function parseAmazonReviews($: cheerio.CheerioAPI, limit: number): ReviewResult {
  const product = $("span#productTitle").text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    null;

  const totalReviewsText = $("span#acrCustomerReviewText").text().trim();
  const totalReviewsMatch = totalReviewsText.match(/([\d,]+)/);
  const totalReviews = totalReviewsMatch?.[1] ?? null;

  const avgRatingText = $("span#acrPopover").attr("title") ||
    $("span.a-icon-alt").first().text().trim();
  const avgRatingMatch = avgRatingText?.match(/([\d.]+)/);
  const averageRating = avgRatingMatch?.[1] ?? null;

  const reviews: Review[] = [];
  $("div[data-hook='review']").each((_i, el) => {
    if (reviews.length >= limit) return;

    const author = $(el).find("span.a-profile-name").text().trim() || null;
    const ratingText = $(el).find("i[data-hook='review-star-rating'] span").text().trim();
    const ratingMatch = ratingText.match(/([\d.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1] ?? "0") : null;
    const title = $(el).find("a[data-hook='review-title'] span").last().text().trim() || null;
    const content = $(el).find("span[data-hook='review-body'] span").text().trim();
    const date = $(el).find("span[data-hook='review-date']").text().trim() || null;

    reviews.push({ author, rating, title, content: content.slice(0, 1000), date });
  });

  return { url: "", product, totalReviews, averageRating, reviews };
}

function parseGenericReviews($: cheerio.CheerioAPI, limit: number): ReviewResult {
  const product = $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim() ||
    null;

  const reviews: Review[] = [];

  // Try common review selectors
  const reviewSelectors = [
    "[itemprop='review']",
    ".review",
    ".customer-review",
    "[data-review]",
  ];

  for (const selector of reviewSelectors) {
    $(selector).each((_i, el) => {
      if (reviews.length >= limit) return;

      const author = $(el).find("[itemprop='author'], .review-author, .author").text().trim() || null;
      const ratingText = $(el).find("[itemprop='ratingValue'], .rating, .stars").text().trim();
      const ratingMatch = ratingText.match(/([\d.]+)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1] ?? "0") : null;
      const title = $(el).find("[itemprop='name'], .review-title, h3, h4").first().text().trim() || null;
      const content = $(el).find("[itemprop='reviewBody'], .review-text, .review-content, p").text().trim();
      const date = $(el).find("[itemprop='datePublished'], .review-date, time").text().trim() || null;

      if (content) {
        reviews.push({ author, rating, title, content: content.slice(0, 1000), date });
      }
    });

    if (reviews.length > 0) break;
  }

  const avgRating = $(
    "[itemprop='aggregateRating'] [itemprop='ratingValue']",
  ).attr("content") ?? null;
  const totalReviews = $(
    "[itemprop='aggregateRating'] [itemprop='reviewCount']",
  ).attr("content") ?? null;

  return { url: "", product, totalReviews, averageRating: avgRating, reviews };
}

export async function reviewAggregatorRoutes(app: FastifyInstance): Promise<void> {
  app.post("/fetch", async (request, reply) => {
    const params = fetchReviewsSchema.parse(request.body);

    let html: string;
    try {
      const response = await fetch(params.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
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
    const isAmazon = params.url.toLowerCase().includes("amazon");

    const result = isAmazon
      ? parseAmazonReviews($, params.limit)
      : parseGenericReviews($, params.limit);

    result.url = params.url;

    sendSuccess(reply, result);
  });
}
