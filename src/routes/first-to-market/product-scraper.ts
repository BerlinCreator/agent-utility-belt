import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const extractSchema = z.object({
  url: z.string().url().max(2048),
});

interface ProductData {
  title: string | null;
  price: string | null;
  currency: string | null;
  images: string[];
  description: string | null;
  availability: string | null;
  rating: string | null;
  reviews: number | null;
  url: string;
}

async function extractProduct(url: string): Promise<ProductData> {
  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    html = await response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    throw new ValidationError(`Failed to fetch product page: ${message}`);
  }

  const { load } = await import("cheerio");
  const $ = load(html);

  // Helper to get Open Graph or meta content
  const getMeta = (names: string[]): string | null => {
    for (const name of names) {
      const content = $(`meta[property="${name}"], meta[name="${name}"]`).attr("content");
      if (content) return content.trim();
    }
    return null;
  };

  // Extract structured data (JSON-LD)
  let jsonLd: Record<string, unknown> | null = null;
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const text = $(el).text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed["@type"] === "Product" || (Array.isArray(parsed["@graph"]) && (parsed["@graph"] as Array<Record<string, unknown>>).some(item => item["@type"] === "Product"))) {
        if (parsed["@type"] === "Product") {
          jsonLd = parsed;
        } else if (Array.isArray(parsed["@graph"])) {
          jsonLd = (parsed["@graph"] as Array<Record<string, unknown>>).find(item => item["@type"] === "Product") ?? null;
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  });

  // Title
  const title = (jsonLd?.["name"] as string | undefined)
    ?? getMeta(["og:title", "product:title"])
    ?? ($("#productTitle, .product-title, h1.title, [data-testid='product-title'], h1").first().text().trim() || null);

  // Price
  const priceFromLd = jsonLd?.["offers"] as Record<string, unknown> | undefined;
  let price = (priceFromLd?.["price"] as string | undefined)
    ?? getMeta(["product:price:amount", "og:price:amount"]);
  let currency = (priceFromLd?.["priceCurrency"] as string | undefined)
    ?? getMeta(["product:price:currency", "og:price:currency"]);

  if (!price) {
    const priceText = $(".price, .product-price, #priceblock_ourprice, .a-price .a-offscreen, [data-testid='price'], .Price").first().text().trim();
    if (priceText) {
      const match = priceText.match(/([£$€¥₹])\s*([\d,]+\.?\d*)/);
      if (match) {
        const currencyMap: Record<string, string> = { "$": "USD", "£": "GBP", "€": "EUR", "¥": "JPY", "₹": "INR" };
        currency = currency ?? currencyMap[match[1]!] ?? null;
        price = match[2]!.replace(/,/g, "");
      } else {
        price = priceText.replace(/[^0-9.,]/g, "").replace(/,/g, "") ?? null;
      }
    }
  }

  // Images
  const images: string[] = [];
  const ogImage = getMeta(["og:image"]);
  if (ogImage) images.push(ogImage);

  $("img[src]").each((_i, el) => {
    if (images.length >= 5) return;
    const src = $(el).attr("src");
    const alt = $(el).attr("alt")?.toLowerCase() ?? "";
    if (src && (alt.includes("product") || $(el).closest(".product, .gallery, #imgTagWrapperId").length > 0)) {
      if (!images.includes(src)) images.push(src);
    }
  });

  // Description
  const description = (jsonLd?.["description"] as string | undefined)
    ?? getMeta(["og:description", "description"])
    ?? ($("#productDescription, .product-description, [data-testid='product-description']").first().text().trim().substring(0, 1000) || null);

  // Availability
  const availabilityFromLd = (priceFromLd?.["availability"] as string | undefined)?.replace("https://schema.org/", "");
  const availability = availabilityFromLd
    ?? ($("#availability, .availability").first().text().trim() || null);

  // Rating
  const ratingFromLd = jsonLd?.["aggregateRating"] as Record<string, unknown> | undefined;
  const rating = (ratingFromLd?.["ratingValue"] as string | undefined)
    ?? $(".rating, .star-rating, [data-testid='rating']").first().text().trim().match(/[\d.]+/)?.[0]
    ?? null;

  const reviewCount = ratingFromLd?.["reviewCount"] as number | undefined;
  const parsedReviewCount = parseInt($(".review-count, .ratings-count, [data-testid='review-count']").first().text().replace(/\D/g, ""), 10);
  const reviews = reviewCount ?? (isNaN(parsedReviewCount) ? null : parsedReviewCount);

  return {
    title,
    price,
    currency: currency ?? null,
    images,
    description,
    availability,
    rating,
    reviews,
    url,
  };
}

export async function productScraperRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/product/extract
  app.post("/extract", async (request, reply) => {
    const { url } = extractSchema.parse(request.body);
    const productData = await extractProduct(url);
    sendSuccess(reply, productData);
  });
}
