import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const checkSchema = z.object({
  url: z.string().url().max(2048),
  headers: z.record(z.string(), z.string()).optional(),
});

interface RateLimitInfo {
  url: string;
  limit: number | null;
  remaining: number | null;
  reset: string | null;
  retryAfter: number | null;
  status: number;
}

function extractRateLimitHeaders(headers: Headers): Omit<RateLimitInfo, "url" | "status"> {
  const getHeader = (names: string[]): string | null => {
    for (const name of names) {
      const value = headers.get(name);
      if (value !== null) return value;
    }
    return null;
  };

  const limitStr = getHeader(["x-ratelimit-limit", "x-rate-limit-limit", "ratelimit-limit"]);
  const remainingStr = getHeader(["x-ratelimit-remaining", "x-rate-limit-remaining", "ratelimit-remaining"]);
  const resetStr = getHeader(["x-ratelimit-reset", "x-rate-limit-reset", "ratelimit-reset"]);
  const retryAfterStr = getHeader(["retry-after"]);

  const limit = limitStr !== null ? parseInt(limitStr, 10) : null;
  const remaining = remainingStr !== null ? parseInt(remainingStr, 10) : null;

  let reset: string | null = null;
  if (resetStr !== null) {
    const resetNum = parseInt(resetStr, 10);
    // If it's a Unix timestamp (> year 2000 in seconds), convert to ISO
    if (resetNum > 946684800) {
      reset = new Date(resetNum * 1000).toISOString();
    } else {
      reset = `${resetNum}s`;
    }
  }

  const retryAfter = retryAfterStr !== null ? parseInt(retryAfterStr, 10) : null;

  return {
    limit: limit !== null && !isNaN(limit) ? limit : null,
    remaining: remaining !== null && !isNaN(remaining) ? remaining : null,
    reset,
    retryAfter: retryAfter !== null && !isNaN(retryAfter) ? retryAfter : null,
  };
}

export async function rateOracleRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/rate-oracle/check
  app.post("/check", async (request, reply) => {
    const { url, headers: customHeaders } = checkSchema.parse(request.body);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "HEAD",
        headers: customHeaders,
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      throw new ValidationError(`Failed to reach URL: ${message}`);
    }

    const rateLimitInfo = extractRateLimitHeaders(response.headers);

    sendSuccess(reply, {
      url,
      limit: rateLimitInfo.limit,
      remaining: rateLimitInfo.remaining,
      reset: rateLimitInfo.reset,
      retryAfter: rateLimitInfo.retryAfter,
      status: response.status,
    });
  });
}
