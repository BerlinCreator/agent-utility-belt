import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as cheerio from "cheerio";
import { sendSuccess } from "../../utils/response.js";
import { AppError } from "../../utils/errors.js";

const lookupSchema = z.object({
  url: z.string().url(),
});

interface PriceResult {
  url: string;
  platform: string;
  title: string | null;
  price: string | null;
  currency: string | null;
  availability: string | null;
  imageUrl: string | null;
  timestamp: string;
}

function detectPlatform(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes("amazon")) return "amazon";
  if (hostname.includes("ebay")) return "ebay";
  if (hostname.includes("walmart")) return "walmart";
  if (hostname.includes("target")) return "target";
  return "unknown";
}

function parseAmazonPrice($: cheerio.CheerioAPI): Partial<PriceResult> {
  const title = $("span#productTitle").text().trim() ||
    $("h1#title span").text().trim() ||
    null;

  const priceWhole = $("span.a-price-whole").first().text().replace(",", "").trim();
  const priceFraction = $("span.a-price-fraction").first().text().trim();
  const price = priceWhole ? `${priceWhole}${priceFraction || "00"}` : null;

  const currency = $("span.a-price-symbol").first().text().trim() || null;

  const availability = $("div#availability span").text().trim() ||
    $("span#availability span").text().trim() ||
    null;

  const imageUrl = $("img#landingImage").attr("src") ||
    $("img#imgBlkFront").attr("src") ||
    null;

  return { title, price, currency, availability, imageUrl };
}

function parseEbayPrice($: cheerio.CheerioAPI): Partial<PriceResult> {
  const title = $("h1.x-item-title__mainTitle span").text().trim() ||
    $("h1#itemTitle").text().replace("Details about", "").trim() ||
    null;

  const priceText = $("div.x-price-primary span").first().text().trim() ||
    $("span#prcIsum").text().trim() ||
    "";

  const priceMatch = priceText.match(/([\d,.]+)/);
  const price = priceMatch?.[1]?.replace(",", "") ?? null;

  const currencyMatch = priceText.match(/([£$€]|USD|GBP|EUR)/);
  const currency = currencyMatch?.[1] ?? null;

  const imageUrl = $("img.ux-image-carousel-item").first().attr("src") ||
    $("img#icImg").attr("src") ||
    null;

  return { title, price, currency, availability: null, imageUrl };
}

function parseGenericPrice($: cheerio.CheerioAPI): Partial<PriceResult> {
  const title = $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim() ||
    null;

  // Try common price selectors and structured data
  const priceEl =
    $('[itemprop="price"]').attr("content") ||
    $('[data-price]').attr("data-price") ||
    $(".price").first().text().trim();

  const priceMatch = priceEl?.match(/([\d,.]+)/);
  const price = priceMatch?.[1]?.replace(",", "") ?? null;

  const currency =
    $('[itemprop="priceCurrency"]').attr("content") ||
    priceEl?.match(/([£$€]|USD|GBP|EUR)/)?.[1] ||
    null;

  const imageUrl = $('meta[property="og:image"]').attr("content") || null;

  return { title, price, currency, availability: null, imageUrl };
}

export async function priceTrackerRoutes(app: FastifyInstance): Promise<void> {
  app.post("/lookup", async (request, reply) => {
    const params = lookupSchema.parse(request.body);

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
    const platform = detectPlatform(params.url);

    let parsed: Partial<PriceResult>;
    switch (platform) {
      case "amazon":
        parsed = parseAmazonPrice($);
        break;
      case "ebay":
        parsed = parseEbayPrice($);
        break;
      default:
        parsed = parseGenericPrice($);
        break;
    }

    const result: PriceResult = {
      url: params.url,
      platform,
      title: parsed.title ?? null,
      price: parsed.price ?? null,
      currency: parsed.currency ?? null,
      availability: parsed.availability ?? null,
      imageUrl: parsed.imageUrl ?? null,
      timestamp: new Date().toISOString(),
    };

    sendSuccess(reply, result);
  });
}
