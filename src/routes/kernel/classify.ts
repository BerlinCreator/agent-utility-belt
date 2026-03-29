import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const ruleSchema = z.object({
  label: z.string().min(1),
  keywords: z.array(z.string()).optional(),
  patterns: z.array(z.string()).optional(),
  minScore: z.number().min(0).max(1).default(0),
});

const classifySchema = z.object({
  text: z.string().min(1).max(100000),
  rules: z.array(ruleSchema).min(1).max(100),
  multiLabel: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
});

export async function classifyRoutes(app: FastifyInstance): Promise<void> {
  app.post("/classify", async (request, reply) => {
    const body = classifySchema.parse(request.body);

    const text = body.caseSensitive ? body.text : body.text.toLowerCase();
    const words = text.split(/\s+/);
    const wordCount = words.length || 1;

    const results: Array<{ label: string; score: number; matchedKeywords: string[]; matchedPatterns: string[] }> = [];

    for (const rule of body.rules) {
      let score = 0;
      const matchedKeywords: string[] = [];
      const matchedPatterns: string[] = [];

      if (rule.keywords && rule.keywords.length > 0) {
        for (const kw of rule.keywords) {
          const keyword = body.caseSensitive ? kw : kw.toLowerCase();
          const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
          const matches = text.match(regex);
          if (matches && matches.length > 0) {
            matchedKeywords.push(kw);
            score += matches.length / wordCount;
          }
        }
      }

      if (rule.patterns && rule.patterns.length > 0) {
        for (const pat of rule.patterns) {
          try {
            const flags = body.caseSensitive ? "g" : "gi";
            const regex = new RegExp(pat, flags);
            const matches = text.match(regex);
            if (matches && matches.length > 0) {
              matchedPatterns.push(pat);
              score += matches.length / wordCount;
            }
          } catch {
            throw new ValidationError(`Invalid regex pattern: ${pat}`);
          }
        }
      }

      const maxPossible = (rule.keywords?.length ?? 0) + (rule.patterns?.length ?? 0);
      const normalizedScore = maxPossible > 0 ? Math.min(score, 1) : 0;

      if (normalizedScore >= rule.minScore) {
        results.push({ label: rule.label, score: normalizedScore, matchedKeywords, matchedPatterns });
      }
    }

    results.sort((a, b) => b.score - a.score);

    const labels = body.multiLabel ? results : results.slice(0, 1);

    sendSuccess(reply, {
      labels,
      bestMatch: results[0] ?? null,
    });
  });
}
