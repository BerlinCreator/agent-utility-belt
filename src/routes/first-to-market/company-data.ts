import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const lookupSchema = z.object({
  domain: z.string().min(1).max(255),
});

interface CompanyInfo {
  name: string | null;
  domain: string;
  industry: string | null;
  employees: string | null;
  location: string | null;
  logo: string | null;
  social: {
    twitter: string | null;
    linkedin: string | null;
    github: string | null;
  };
  description: string | null;
}

async function lookupCompany(domain: string): Promise<CompanyInfo> {
  // Normalize domain
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0]!.toLowerCase();

  // Try to fetch metadata from the website itself
  let html = "";
  try {
    const response = await fetch(`https://${cleanDomain}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentUtilityBelt/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (response.ok) {
      html = await response.text();
    }
  } catch {
    // Webpage fetch failed, continue with partial data
  }

  const { load } = await import("cheerio");
  const $ = load(html);

  // Extract metadata from HTML
  const getMetaContent = (names: string[]): string | null => {
    for (const name of names) {
      const content = $(`meta[property="${name}"], meta[name="${name}"]`).attr("content");
      if (content) return content.trim();
    }
    return null;
  };

  const name = getMetaContent(["og:site_name", "application-name"]) ?? $("title").first().text().trim().split(/[|\-–]/).shift()?.trim() ?? null;
  const description = getMetaContent(["og:description", "description"]);
  const logo = getMetaContent(["og:image"]) ?? $('link[rel="icon"], link[rel="shortcut icon"]').attr("href") ?? null;

  // Extract social links
  const extractSocialLink = (pattern: RegExp): string | null => {
    let found: string | null = null;
    $("a[href]").each((_i, el) => {
      const href = $(el).attr("href");
      if (href && pattern.test(href) && !found) {
        found = href;
      }
    });
    return found;
  };

  const twitter = extractSocialLink(/twitter\.com\/|x\.com\//);
  const linkedin = extractSocialLink(/linkedin\.com\//);
  const github = extractSocialLink(/github\.com\//);

  return {
    name,
    domain: cleanDomain,
    industry: null, // Would need external API for reliable industry data
    employees: null,
    location: null,
    logo: logo && !logo.startsWith("http") ? `https://${cleanDomain}${logo.startsWith("/") ? "" : "/"}${logo}` : logo,
    social: { twitter, linkedin, github },
    description,
  };
}

export async function companyDataRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/company/lookup
  app.post("/lookup", async (request, reply) => {
    const { domain } = lookupSchema.parse(request.body);

    let companyInfo: CompanyInfo;
    try {
      companyInfo = await lookupCompany(domain);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Lookup failed";
      throw new ValidationError(`Company lookup failed: ${message}`);
    }

    sendSuccess(reply, companyInfo);
  });
}
