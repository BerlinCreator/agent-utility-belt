import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const convertSchema = z.object({
  from: z.string().length(3).toUpperCase(),
  to: z.string().length(3).toUpperCase(),
  amount: z.coerce.number().positive(),
});

const ratesSchema = z.object({
  base: z.string().length(3).toUpperCase().default("USD"),
});

// In-memory cache for exchange rates (refreshed every hour)
let ratesCache: { rates: Record<string, number>; base: string; timestamp: number } | null = null;
const CACHE_TTL = 3600000; // 1 hour

async function fetchRates(base: string): Promise<Record<string, number>> {
  if (ratesCache && ratesCache.base === base && Date.now() - ratesCache.timestamp < CACHE_TTL) {
    return ratesCache.rates;
  }

  // Use the free exchangerate.host or frankfurter.app API (no key needed)
  const response = await fetch(`https://api.frankfurter.app/latest?from=${base}`);

  if (!response.ok) {
    throw new ValidationError(`Failed to fetch exchange rates: ${response.statusText}`);
  }

  const data = await response.json() as { rates: Record<string, number> };

  ratesCache = {
    rates: { [base]: 1, ...data.rates },
    base,
    timestamp: Date.now(),
  };

  return ratesCache.rates;
}

export async function currencyRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/currency/convert
  app.post("/convert", async (request, reply) => {
    const params = convertSchema.parse(request.body);

    const rates = await fetchRates(params.from);
    const rate = rates[params.to];

    if (rate === undefined) {
      throw new ValidationError(`Unsupported currency: ${params.to}`);
    }

    const converted = params.amount * rate;

    sendSuccess(reply, {
      from: params.from,
      to: params.to,
      amount: params.amount,
      converted: Math.round(converted * 100) / 100,
      rate,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /v1/currency/rates
  app.get("/rates", async (request, reply) => {
    const params = ratesSchema.parse(request.query);
    const rates = await fetchRates(params.base);

    sendSuccess(reply, {
      base: params.base,
      rates,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /v1/currency/supported
  app.get("/supported", async (_request, reply) => {
    const rates = await fetchRates("USD");
    sendSuccess(reply, {
      currencies: Object.keys(rates).sort(),
      count: Object.keys(rates).length,
    });
  });
}
