import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const lookupSchema = z.object({
  ip: z.string().min(1).max(45),
});

const bulkLookupSchema = z.object({
  ips: z.array(z.string().min(1).max(45)).min(1).max(50),
});

// Use ip-api.com free tier (45 requests/minute, no key needed)
async function lookupIp(ip: string): Promise<IpGeoResult> {
  const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`);

  if (!response.ok) {
    throw new ValidationError(`Failed to lookup IP: ${response.statusText}`);
  }

  const data = await response.json() as IpApiResponse;

  if (data.status === "fail") {
    throw new ValidationError(`IP lookup failed: ${data.message ?? "Unknown error"}`);
  }

  return {
    ip: data.query,
    country: data.country,
    countryCode: data.countryCode,
    region: data.regionName,
    regionCode: data.region,
    city: data.city,
    zip: data.zip,
    latitude: data.lat,
    longitude: data.lon,
    timezone: data.timezone,
    isp: data.isp,
    organization: data.org,
    asn: data.as,
  };
}

function getClientIp(forwardedForHeader: string | undefined, requestIp: string): string {
  const forwardedIp = forwardedForHeader?.split(",")[0]?.trim();
  const candidate = forwardedIp || requestIp;
  return normalizeIp(candidate);
}

function normalizeIp(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }

  if (ip === "::1") return "127.0.0.1";

  return ip;
}

interface IpApiResponse {
  status: string;
  message?: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  org: string;
  as: string;
  query: string;
}

interface IpGeoResult {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  regionCode: string;
  city: string;
  zip: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp: string;
  organization: string;
  asn: string;
}

export async function ipGeoRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/ip/lookup
  app.post("/lookup", async (request, reply) => {
    const { ip } = lookupSchema.parse(request.body);
    const result = await lookupIp(ip);
    sendSuccess(reply, result);
  });

  // GET /v1/ip/me — lookup the requester's IP
  app.get("/me", async (request, reply) => {
    const ip = getClientIp(request.headers["x-forwarded-for"] as string | undefined, request.ip);
    const result = await lookupIp(ip);
    sendSuccess(reply, result);
  });

  // POST /v1/ip/bulk
  app.post("/bulk", async (request, reply) => {
    const { ips } = bulkLookupSchema.parse(request.body);
    const results = await Promise.all(
      ips.map(async (ip) => {
        try {
          return await lookupIp(ip);
        } catch {
          return { ip, error: "Lookup failed" };
        }
      }),
    );
    sendSuccess(reply, { results, total: results.length });
  });
}
