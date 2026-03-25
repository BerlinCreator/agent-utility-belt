import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const lookupSchema = z.object({
  country: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
});

interface TaxBreakdown {
  name: string;
  rate: number;
}

interface TaxInfo {
  country: string;
  state: string | null;
  city: string | null;
  taxType: string;
  rate: number;
  breakdown: TaxBreakdown[];
}

// Built-in dataset of major tax rates
const TAX_DATA: Record<string, { taxType: string; rate: number; breakdown: TaxBreakdown[]; states?: Record<string, { rate: number; breakdown: TaxBreakdown[] }> }> = {
  US: {
    taxType: "Sales Tax",
    rate: 0,
    breakdown: [{ name: "Federal Sales Tax", rate: 0 }],
    states: {
      CA: { rate: 7.25, breakdown: [{ name: "State Sales Tax", rate: 7.25 }] },
      TX: { rate: 6.25, breakdown: [{ name: "State Sales Tax", rate: 6.25 }] },
      NY: { rate: 4.0, breakdown: [{ name: "State Sales Tax", rate: 4.0 }] },
      FL: { rate: 6.0, breakdown: [{ name: "State Sales Tax", rate: 6.0 }] },
      WA: { rate: 6.5, breakdown: [{ name: "State Sales Tax", rate: 6.5 }] },
      IL: { rate: 6.25, breakdown: [{ name: "State Sales Tax", rate: 6.25 }] },
      PA: { rate: 6.0, breakdown: [{ name: "State Sales Tax", rate: 6.0 }] },
      OH: { rate: 5.75, breakdown: [{ name: "State Sales Tax", rate: 5.75 }] },
      NJ: { rate: 6.625, breakdown: [{ name: "State Sales Tax", rate: 6.625 }] },
      OR: { rate: 0, breakdown: [{ name: "No Sales Tax", rate: 0 }] },
      NH: { rate: 0, breakdown: [{ name: "No Sales Tax", rate: 0 }] },
      MT: { rate: 0, breakdown: [{ name: "No Sales Tax", rate: 0 }] },
      DE: { rate: 0, breakdown: [{ name: "No Sales Tax", rate: 0 }] },
      AK: { rate: 0, breakdown: [{ name: "No State Sales Tax", rate: 0 }] },
    },
  },
  GB: {
    taxType: "VAT",
    rate: 20,
    breakdown: [{ name: "Standard VAT", rate: 20 }, { name: "Reduced Rate", rate: 5 }, { name: "Zero Rate", rate: 0 }],
  },
  DE: {
    taxType: "VAT (Mehrwertsteuer)",
    rate: 19,
    breakdown: [{ name: "Standard Rate", rate: 19 }, { name: "Reduced Rate", rate: 7 }],
  },
  FR: {
    taxType: "VAT (TVA)",
    rate: 20,
    breakdown: [{ name: "Standard Rate", rate: 20 }, { name: "Intermediate Rate", rate: 10 }, { name: "Reduced Rate", rate: 5.5 }, { name: "Super Reduced", rate: 2.1 }],
  },
  JP: {
    taxType: "Consumption Tax",
    rate: 10,
    breakdown: [{ name: "Standard Rate", rate: 10 }, { name: "Reduced Rate (Food)", rate: 8 }],
  },
  CA: {
    taxType: "GST/HST",
    rate: 5,
    breakdown: [{ name: "Federal GST", rate: 5 }],
    states: {
      ON: { rate: 13, breakdown: [{ name: "HST", rate: 13 }] },
      BC: { rate: 12, breakdown: [{ name: "GST", rate: 5 }, { name: "PST", rate: 7 }] },
      AB: { rate: 5, breakdown: [{ name: "GST", rate: 5 }] },
      QC: { rate: 14.975, breakdown: [{ name: "GST", rate: 5 }, { name: "QST", rate: 9.975 }] },
      NS: { rate: 15, breakdown: [{ name: "HST", rate: 15 }] },
    },
  },
  AU: {
    taxType: "GST",
    rate: 10,
    breakdown: [{ name: "Goods and Services Tax", rate: 10 }],
  },
  IN: {
    taxType: "GST",
    rate: 18,
    breakdown: [{ name: "CGST", rate: 9 }, { name: "SGST", rate: 9 }],
  },
  BR: {
    taxType: "ICMS/IPI",
    rate: 17,
    breakdown: [{ name: "ICMS (avg)", rate: 17 }, { name: "IPI (avg)", rate: 10 }],
  },
  CN: {
    taxType: "VAT",
    rate: 13,
    breakdown: [{ name: "Standard Rate", rate: 13 }, { name: "Reduced Rate", rate: 9 }, { name: "Low Rate", rate: 6 }],
  },
  KR: {
    taxType: "VAT",
    rate: 10,
    breakdown: [{ name: "Standard Rate", rate: 10 }],
  },
  SG: {
    taxType: "GST",
    rate: 9,
    breakdown: [{ name: "Goods and Services Tax", rate: 9 }],
  },
  AE: {
    taxType: "VAT",
    rate: 5,
    breakdown: [{ name: "Standard Rate", rate: 5 }],
  },
  MX: {
    taxType: "IVA",
    rate: 16,
    breakdown: [{ name: "Standard Rate", rate: 16 }],
  },
  IT: {
    taxType: "VAT (IVA)",
    rate: 22,
    breakdown: [{ name: "Standard Rate", rate: 22 }, { name: "Reduced Rate", rate: 10 }, { name: "Super Reduced", rate: 4 }],
  },
  ES: {
    taxType: "VAT (IVA)",
    rate: 21,
    breakdown: [{ name: "Standard Rate", rate: 21 }, { name: "Reduced Rate", rate: 10 }, { name: "Super Reduced", rate: 4 }],
  },
};

// Country name to code mapping
const COUNTRY_NAME_MAP: Record<string, string> = {
  "united states": "US", usa: "US", us: "US", america: "US",
  "united kingdom": "GB", uk: "GB", gb: "GB", england: "GB",
  germany: "DE", france: "FR", japan: "JP", canada: "CA",
  australia: "AU", india: "IN", brazil: "BR", china: "CN",
  "south korea": "KR", korea: "KR", singapore: "SG",
  "united arab emirates": "AE", uae: "AE", mexico: "MX",
  italy: "IT", spain: "ES",
};

function resolveCountryCode(input: string): string {
  const upper = input.toUpperCase().trim();
  if (TAX_DATA[upper]) return upper;
  const mapped = COUNTRY_NAME_MAP[input.toLowerCase().trim()];
  return mapped ?? upper;
}

export async function taxLookupRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/tax/lookup
  app.post("/lookup", async (request, reply) => {
    const { country, state, city } = lookupSchema.parse(request.body);

    const countryCode = resolveCountryCode(country);
    const countryData = TAX_DATA[countryCode];

    if (!countryData) {
      throw new NotFoundError(`Tax data not available for country: ${country}`);
    }

    let result: TaxInfo;

    if (state && countryData.states) {
      const stateCode = state.toUpperCase().trim();
      const stateData = countryData.states[stateCode];

      if (stateData) {
        result = {
          country: countryCode,
          state: stateCode,
          city: city ?? null,
          taxType: countryData.taxType,
          rate: stateData.rate,
          breakdown: stateData.breakdown,
        };
      } else {
        result = {
          country: countryCode,
          state: stateCode,
          city: city ?? null,
          taxType: countryData.taxType,
          rate: countryData.rate,
          breakdown: countryData.breakdown,
        };
      }
    } else {
      result = {
        country: countryCode,
        state: state ?? null,
        city: city ?? null,
        taxType: countryData.taxType,
        rate: countryData.rate,
        breakdown: countryData.breakdown,
      };
    }

    sendSuccess(reply, result);
  });
}
