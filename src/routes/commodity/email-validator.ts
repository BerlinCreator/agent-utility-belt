import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as dns } from "node:dns";
import { sendSuccess } from "../../utils/response.js";

const validateSchema = z.object({
  email: z.string().min(1).max(320),
});

const bulkValidateSchema = z.object({
  emails: z.array(z.string().min(1).max(320)).min(1).max(100),
});

// Common disposable email domains
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "discard.email", "maildrop.cc", "10minutemail.com", "trashmail.com",
  "temp-mail.org", "fakeinbox.com", "getnada.com", "mohmal.com",
]);

// Common free email providers
const FREE_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
  "live.com", "msn.com", "gmx.com", "fastmail.com",
]);

export async function emailValidatorRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/email/validate
  app.post("/validate", async (request, reply) => {
    const { email } = validateSchema.parse(request.body);
    const result = await validateEmail(email);
    sendSuccess(reply, result);
  });

  // POST /v1/email/validate/bulk
  app.post("/validate/bulk", async (request, reply) => {
    const { emails } = bulkValidateSchema.parse(request.body);
    const results = await Promise.all(emails.map(validateEmail));
    sendSuccess(reply, { results, total: results.length });
  });
}

async function validateEmail(email: string) {
  const syntaxValid = isValidSyntax(email);
  const parts = email.split("@");
  const domain = parts[1]?.toLowerCase() ?? "";

  let mxRecords: boolean | null = null;
  let hasDNS = false;

  if (syntaxValid && domain) {
    try {
      const records = await dns.resolveMx(domain);
      mxRecords = records.length > 0;
      hasDNS = true;
    } catch {
      mxRecords = false;
    }
  }

  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  const isFreeProvider = FREE_PROVIDERS.has(domain);

  return {
    email,
    valid: syntaxValid && mxRecords === true,
    syntax: syntaxValid,
    domain,
    mxRecords,
    hasDNS,
    isDisposable,
    isFreeProvider,
    suggestion: getSuggestion(email),
  };
}

function isValidSyntax(email: string): boolean {
  // RFC 5322 simplified
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return re.test(email) && email.length <= 320;
}

function getSuggestion(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const corrections: Record<string, string> = {
    "gamil.com": "gmail.com",
    "gmai.com": "gmail.com",
    "gmial.com": "gmail.com",
    "gnail.com": "gmail.com",
    "hotmial.com": "hotmail.com",
    "hotmal.com": "hotmail.com",
    "yaho.com": "yahoo.com",
    "yahooo.com": "yahoo.com",
    "outloo.com": "outlook.com",
    "outlok.com": "outlook.com",
  };

  const corrected = corrections[domain];
  if (corrected) {
    return email.replace(domain, corrected);
  }
  return null;
}
