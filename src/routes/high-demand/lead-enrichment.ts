import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as dns } from "node:dns";
import { sendSuccess } from "../../utils/response.js";
import { AppError } from "../../utils/errors.js";

const emailEnrichSchema = z.object({
  email: z.string().email(),
});

const domainEnrichSchema = z.object({
  domain: z.string().min(1).max(253),
});

interface CompanyInfo {
  domain: string;
  name: string | null;
  industry: string | null;
  social: Record<string, string>;
  mxProvider: string | null;
  hasMxRecords: boolean;
  confidence: number;
}

const KNOWN_MX_PROVIDERS: Record<string, string> = {
  "google.com": "Google Workspace",
  "googlemail.com": "Google Workspace",
  "outlook.com": "Microsoft 365",
  "protection.outlook.com": "Microsoft 365",
  "pphosted.com": "Proofpoint",
  "mimecast.com": "Mimecast",
  "barracudanetworks.com": "Barracuda",
  "zoho.com": "Zoho Mail",
};

async function lookupDomain(domain: string): Promise<CompanyInfo> {
  let hasMxRecords = false;
  let mxProvider: string | null = null;
  let confidence = 0.3;

  try {
    const mxRecords = await dns.resolveMx(domain);
    hasMxRecords = mxRecords.length > 0;

    if (hasMxRecords) {
      confidence = 0.5;
      const primaryMx = mxRecords.sort((a, b) => a.priority - b.priority)[0]?.exchange.toLowerCase() ?? "";

      for (const [pattern, provider] of Object.entries(KNOWN_MX_PROVIDERS)) {
        if (primaryMx.includes(pattern)) {
          mxProvider = provider;
          confidence = 0.6;
          break;
        }
      }
    }
  } catch {
    // DNS lookup failed — domain may not exist
  }

  // Attempt to infer company name from domain
  const domainParts = domain.split(".");
  const name = domainParts[0]
    ? domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1)
    : null;

  // Build potential social links
  const social: Record<string, string> = {};
  if (name) {
    social.linkedin = `https://www.linkedin.com/company/${domainParts[0] ?? ""}`;
    social.twitter = `https://twitter.com/${domainParts[0] ?? ""}`;
  }

  return {
    domain,
    name,
    industry: null,
    social,
    mxProvider,
    hasMxRecords,
    confidence,
  };
}

export async function leadEnrichmentRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/enrich/email
  app.post("/email", async (request, reply) => {
    const { email } = emailEnrichSchema.parse(request.body);
    const domain = email.split("@")[1];

    if (!domain) {
      throw new AppError(400, "INVALID_EMAIL", "Could not extract domain from email");
    }

    const companyInfo = await lookupDomain(domain);

    sendSuccess(reply, {
      email,
      domain,
      company: companyInfo.name,
      industry: companyInfo.industry,
      social: companyInfo.social,
      mxProvider: companyInfo.mxProvider,
      hasMxRecords: companyInfo.hasMxRecords,
      confidence: companyInfo.confidence,
    });
  });

  // POST /v1/enrich/domain
  app.post("/domain", async (request, reply) => {
    const { domain } = domainEnrichSchema.parse(request.body);
    const companyInfo = await lookupDomain(domain);

    sendSuccess(reply, companyInfo);
  });
}
