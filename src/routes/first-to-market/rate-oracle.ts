import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const SERVICE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/messages",
  supabase: "https://api.supabase.com/v1/projects",
  github: "https://api.github.com/rate_limit",
  stripe: "https://api.stripe.com/v1/charges",
  railway: "https://backboard.railway.com/graphql/v2",
};

const checkSchema = z.object({
  url: z.string().url().max(2048).optional(),
  service: z.string().min(1).max(100).optional(),
  headers: z.record(z.string(), z.string()).optional(),
}).superRefine((value, ctx) => {
  if (!value.url && !value.service) {
    ctx.addIssue({
      code: "custom",
      message: "Either service or url is required",
      path: ["url"],
    });
  }
});

interface RateLimitInfo {
  url: string;
  limit: number | null;
  remaining: number | null;
  reset: string | null;
  retryAfter: number | null;
  status: number;
  service?: string;
}

function extractRateLimitHeaders(headers: Headers): Omit<RateLimitInfo, "url" | "status" | "service"> {
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

function resolveTarget(params: z.infer<typeof checkSchema>): { url: string; service: string | null } {
  if (params.url) {
    return { url: params.url, service: params.service ?? null };
  }

  const serviceKey = params.service?.toLowerCase();
  const url = serviceKey ? SERVICE_URLS[serviceKey] : undefined;

  if (!url) {
    throw new ValidationError(`Unsupported service. Known services: ${Object.keys(SERVICE_URLS).join(", ")}`);
  }

  return { url, service: params.service ?? null };
}

export async function rateOracleRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/rate-oracle/check
  app.post("/check", async (request, reply) => {
    const params = checkSchema.parse(request.body);
    const { url, service } = resolveTarget(params);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "HEAD",
        headers: params.headers,
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      throw new ValidationError(`Failed to reach URL: ${message}`);
    }

    const rateLimitInfo = extractRateLimitHeaders(response.headers);

    sendSuccess(reply, {
      url,
      ...(service ? { service } : {}),
      limit: rateLimitInfo.limit,
      remaining: rateLimitInfo.remaining,
      reset: rateLimitInfo.reset,
      retryAfter: rateLimitInfo.retryAfter,
      status: response.status,
    });
  });
}
