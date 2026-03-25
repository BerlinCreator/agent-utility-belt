import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract: string | null;
  year: number | null;
  citationCount: number;
  url: string;
  authors: Array<{ name: string }>;
}

interface SemanticScholarResponse {
  total: number;
  data: SemanticScholarPaper[];
}

export async function paperSearchRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/papers/search
  app.post("/search", async (request, reply) => {
    const { query, limit } = searchSchema.parse(request.body);

    const params = new URLSearchParams({
      query,
      limit: String(limit),
      fields: "title,abstract,year,citationCount,url,authors",
    });

    let data: SemanticScholarResponse;
    try {
      const response = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`,
        { signal: AbortSignal.timeout(15000) },
      );

      if (!response.ok) {
        throw new Error(`Semantic Scholar API returned ${response.status}`);
      }

      data = await response.json() as SemanticScholarResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      throw new ValidationError(`Paper search failed: ${message}`);
    }

    const results = data.data.map((paper) => ({
      title: paper.title,
      abstract: paper.abstract,
      authors: paper.authors.map((a) => a.name),
      year: paper.year,
      url: paper.url,
      citationCount: paper.citationCount,
    }));

    sendSuccess(reply, { query, total: data.total, results });
  });
}
