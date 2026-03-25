import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const lookupSchema = z.object({
  role: z.string().min(1).max(200),
  location: z.string().max(200).optional(),
  experience: z.enum(["entry", "mid", "senior", "lead", "executive"]).optional(),
});

interface SalaryEntry {
  min: number;
  median: number;
  max: number;
  currency: string;
  sampleSize: number;
}

interface SalaryByExperience {
  entry: SalaryEntry;
  mid: SalaryEntry;
  senior: SalaryEntry;
  lead: SalaryEntry;
  executive: SalaryEntry;
}

// Built-in salary dataset (US-centric, USD)
const SALARY_DATA: Record<string, SalaryByExperience> = {
  "software engineer": {
    entry: { min: 70000, median: 85000, max: 110000, currency: "USD", sampleSize: 15000 },
    mid: { min: 100000, median: 130000, max: 170000, currency: "USD", sampleSize: 22000 },
    senior: { min: 140000, median: 175000, max: 230000, currency: "USD", sampleSize: 18000 },
    lead: { min: 170000, median: 210000, max: 280000, currency: "USD", sampleSize: 8000 },
    executive: { min: 220000, median: 300000, max: 450000, currency: "USD", sampleSize: 3000 },
  },
  "product manager": {
    entry: { min: 65000, median: 80000, max: 100000, currency: "USD", sampleSize: 8000 },
    mid: { min: 95000, median: 120000, max: 155000, currency: "USD", sampleSize: 12000 },
    senior: { min: 130000, median: 165000, max: 210000, currency: "USD", sampleSize: 9000 },
    lead: { min: 160000, median: 200000, max: 260000, currency: "USD", sampleSize: 5000 },
    executive: { min: 200000, median: 280000, max: 400000, currency: "USD", sampleSize: 2000 },
  },
  "data scientist": {
    entry: { min: 65000, median: 80000, max: 105000, currency: "USD", sampleSize: 10000 },
    mid: { min: 95000, median: 125000, max: 160000, currency: "USD", sampleSize: 14000 },
    senior: { min: 135000, median: 170000, max: 220000, currency: "USD", sampleSize: 10000 },
    lead: { min: 165000, median: 205000, max: 270000, currency: "USD", sampleSize: 5000 },
    executive: { min: 210000, median: 290000, max: 420000, currency: "USD", sampleSize: 2000 },
  },
  "frontend developer": {
    entry: { min: 55000, median: 70000, max: 90000, currency: "USD", sampleSize: 12000 },
    mid: { min: 85000, median: 110000, max: 145000, currency: "USD", sampleSize: 16000 },
    senior: { min: 120000, median: 155000, max: 200000, currency: "USD", sampleSize: 12000 },
    lead: { min: 150000, median: 190000, max: 250000, currency: "USD", sampleSize: 6000 },
    executive: { min: 190000, median: 260000, max: 380000, currency: "USD", sampleSize: 2000 },
  },
  "backend developer": {
    entry: { min: 60000, median: 75000, max: 95000, currency: "USD", sampleSize: 11000 },
    mid: { min: 90000, median: 120000, max: 155000, currency: "USD", sampleSize: 15000 },
    senior: { min: 130000, median: 165000, max: 215000, currency: "USD", sampleSize: 11000 },
    lead: { min: 160000, median: 200000, max: 265000, currency: "USD", sampleSize: 5000 },
    executive: { min: 200000, median: 275000, max: 400000, currency: "USD", sampleSize: 2000 },
  },
  "devops engineer": {
    entry: { min: 65000, median: 80000, max: 100000, currency: "USD", sampleSize: 8000 },
    mid: { min: 95000, median: 125000, max: 160000, currency: "USD", sampleSize: 12000 },
    senior: { min: 135000, median: 170000, max: 220000, currency: "USD", sampleSize: 9000 },
    lead: { min: 160000, median: 205000, max: 270000, currency: "USD", sampleSize: 4000 },
    executive: { min: 200000, median: 280000, max: 400000, currency: "USD", sampleSize: 1500 },
  },
  "ux designer": {
    entry: { min: 50000, median: 65000, max: 80000, currency: "USD", sampleSize: 7000 },
    mid: { min: 75000, median: 95000, max: 125000, currency: "USD", sampleSize: 10000 },
    senior: { min: 105000, median: 135000, max: 175000, currency: "USD", sampleSize: 8000 },
    lead: { min: 130000, median: 170000, max: 220000, currency: "USD", sampleSize: 4000 },
    executive: { min: 170000, median: 230000, max: 350000, currency: "USD", sampleSize: 1500 },
  },
  "project manager": {
    entry: { min: 50000, median: 60000, max: 75000, currency: "USD", sampleSize: 9000 },
    mid: { min: 70000, median: 90000, max: 115000, currency: "USD", sampleSize: 13000 },
    senior: { min: 100000, median: 125000, max: 160000, currency: "USD", sampleSize: 10000 },
    lead: { min: 125000, median: 155000, max: 200000, currency: "USD", sampleSize: 5000 },
    executive: { min: 160000, median: 220000, max: 330000, currency: "USD", sampleSize: 2500 },
  },
  "machine learning engineer": {
    entry: { min: 80000, median: 100000, max: 125000, currency: "USD", sampleSize: 6000 },
    mid: { min: 115000, median: 145000, max: 185000, currency: "USD", sampleSize: 9000 },
    senior: { min: 155000, median: 195000, max: 260000, currency: "USD", sampleSize: 7000 },
    lead: { min: 190000, median: 240000, max: 320000, currency: "USD", sampleSize: 3500 },
    executive: { min: 250000, median: 340000, max: 500000, currency: "USD", sampleSize: 1200 },
  },
  "security engineer": {
    entry: { min: 70000, median: 85000, max: 110000, currency: "USD", sampleSize: 5000 },
    mid: { min: 100000, median: 130000, max: 170000, currency: "USD", sampleSize: 8000 },
    senior: { min: 140000, median: 180000, max: 235000, currency: "USD", sampleSize: 6000 },
    lead: { min: 175000, median: 215000, max: 285000, currency: "USD", sampleSize: 3000 },
    executive: { min: 220000, median: 300000, max: 450000, currency: "USD", sampleSize: 1000 },
  },
};

// Location multipliers (relative to US average)
const LOCATION_MULTIPLIERS: Record<string, number> = {
  "san francisco": 1.3, sf: 1.3, "bay area": 1.3,
  "new york": 1.2, nyc: 1.2, "new york city": 1.2,
  seattle: 1.15, boston: 1.1, "los angeles": 1.1, la: 1.1,
  austin: 1.0, denver: 1.0, chicago: 1.0, portland: 0.95,
  atlanta: 0.95, dallas: 0.95, phoenix: 0.9, miami: 0.95,
  remote: 1.0, london: 0.9, berlin: 0.75, amsterdam: 0.8,
  toronto: 0.8, vancouver: 0.8, sydney: 0.85, singapore: 0.85,
  tokyo: 0.8, mumbai: 0.3, bangalore: 0.3, "sao paulo": 0.35,
};

function findRole(query: string): string | null {
  const normalized = query.toLowerCase().trim();
  if (SALARY_DATA[normalized]) return normalized;

  // Fuzzy match: check if query words appear in role names
  for (const role of Object.keys(SALARY_DATA)) {
    if (role.includes(normalized) || normalized.includes(role)) {
      return role;
    }
  }

  // Keyword matching
  const keywords: Record<string, string> = {
    frontend: "frontend developer", react: "frontend developer",
    backend: "backend developer", api: "backend developer",
    devops: "devops engineer", sre: "devops engineer", infrastructure: "devops engineer",
    ml: "machine learning engineer", ai: "machine learning engineer",
    security: "security engineer", cybersecurity: "security engineer",
    design: "ux designer", ux: "ux designer", ui: "ux designer",
    data: "data scientist", analytics: "data scientist",
    product: "product manager", pm: "product manager",
    project: "project manager",
    swe: "software engineer", developer: "software engineer", engineer: "software engineer", programmer: "software engineer",
  };

  for (const [keyword, role] of Object.entries(keywords)) {
    if (normalized.includes(keyword)) return role;
  }

  return null;
}

export async function salaryDataRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/salary/lookup
  app.post("/lookup", async (request, reply) => {
    const { role, location, experience } = lookupSchema.parse(request.body);

    const matchedRole = findRole(role);
    if (!matchedRole) {
      throw new NotFoundError(`Salary data not available for role: ${role}. Try common roles like "software engineer", "product manager", "data scientist".`);
    }

    const roleData = SALARY_DATA[matchedRole]!;
    const level = experience ?? "mid";
    const salaryData = roleData[level];

    // Apply location multiplier
    const multiplier = location
      ? LOCATION_MULTIPLIERS[location.toLowerCase().trim()] ?? 1.0
      : 1.0;

    sendSuccess(reply, {
      role: matchedRole,
      location: location ?? "US Average",
      experience: level,
      min: Math.round(salaryData.min * multiplier),
      median: Math.round(salaryData.median * multiplier),
      max: Math.round(salaryData.max * multiplier),
      currency: salaryData.currency,
      source: "Built-in dataset (approximate)",
      sampleSize: salaryData.sampleSize,
    });
  });
}
