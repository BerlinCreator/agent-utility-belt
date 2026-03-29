import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { sendSuccess } from "../../utils/response.js";

const emailSchema = z.object({
  email: z.string().min(1).max(320),
});

const phoneSchema = z.object({
  phone: z.string().min(1).max(30),
  country: z.string().length(2).optional(),
});

const addressSchema = z.object({
  street: z.string().min(1).max(500),
  city: z.string().min(1).max(255),
  state: z.string().max(100).optional(),
  zip: z.string().max(20).optional(),
  country: z.string().min(1).max(100),
});

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function validateEmail(email: string): { valid: boolean; reason?: string; normalized?: string } {
  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, reason: "Invalid email format" };
  }

  const parts = email.split("@");
  if (parts.length !== 2) return { valid: false, reason: "Invalid email format" };

  const [local, domain] = parts;
  if (!local || !domain) return { valid: false, reason: "Invalid email format" };

  if (local.length > 64) return { valid: false, reason: "Local part exceeds 64 characters" };
  if (domain.length > 255) return { valid: false, reason: "Domain exceeds 255 characters" };

  const domainParts = domain.split(".");
  if (domainParts.length < 2) return { valid: false, reason: "Domain must have at least two parts" };

  const tld = domainParts[domainParts.length - 1]!;
  if (tld.length < 2) return { valid: false, reason: "TLD must be at least 2 characters" };

  return { valid: true, normalized: email.toLowerCase().trim() };
}

export async function verifyRoutes(app: FastifyInstance): Promise<void> {
  // POST /email — validate email format
  app.post("/email", async (request, reply) => {
    const body = emailSchema.parse(request.body);
    const result = validateEmail(body.email);
    sendSuccess(reply, result);
  });

  // POST /phone — validate phone number
  app.post("/phone", async (request, reply) => {
    const body = phoneSchema.parse(request.body);
    const countryCode = (body.country?.toUpperCase() ?? "US") as Parameters<typeof parsePhoneNumberFromString>[1];
    const parsed = parsePhoneNumberFromString(body.phone, countryCode);

    if (!parsed) {
      sendSuccess(reply, { valid: false, reason: "Unable to parse phone number" });
      return;
    }

    sendSuccess(reply, {
      valid: parsed.isValid(),
      formatted: parsed.formatInternational(),
      national: parsed.formatNational(),
      country: parsed.country,
      type: parsed.getType(),
      e164: parsed.number,
    });
  });

  // POST /address — validate address format
  app.post("/address", async (request, reply) => {
    const body = addressSchema.parse(request.body);
    const issues: string[] = [];

    if (body.street.length < 3) issues.push("Street address too short");
    if (body.city.length < 2) issues.push("City name too short");
    if (body.zip && !/^[a-zA-Z0-9\s-]{3,10}$/.test(body.zip)) {
      issues.push("ZIP/postal code format appears invalid");
    }
    if (body.country.length < 2) issues.push("Country name too short");

    sendSuccess(reply, {
      valid: issues.length === 0,
      issues,
      normalized: {
        street: body.street.trim(),
        city: body.city.trim(),
        state: body.state?.trim(),
        zip: body.zip?.trim().toUpperCase(),
        country: body.country.trim(),
      },
    });
  });
}
