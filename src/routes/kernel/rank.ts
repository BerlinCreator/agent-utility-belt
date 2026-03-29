import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const itemSchema = z.object({
  id: z.string().min(1),
  scores: z.record(z.string(), z.number()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const scoreSchema = z.object({
  items: z.array(itemSchema).min(1).max(10000),
  weights: z.record(z.string(), z.number()),
  normalize: z.boolean().default(false),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(10000).optional(),
});

function normalizeScores(items: Array<{ scores: Record<string, number> }>, keys: string[]): void {
  for (const key of keys) {
    const values = items.map((item) => item.scores[key] ?? 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    if (range === 0) continue;
    for (const item of items) {
      item.scores[key] = ((item.scores[key] ?? 0) - min) / range;
    }
  }
}

export async function rankRoutes(app: FastifyInstance): Promise<void> {
  app.post("/score", async (request, reply) => {
    const body = scoreSchema.parse(request.body);

    const weightKeys = Object.keys(body.weights);
    if (weightKeys.length === 0) {
      throw new ValidationError("At least one weight key is required");
    }

    const workingItems = body.items.map((item) => ({
      ...item,
      scores: { ...item.scores },
    }));

    if (body.normalize) {
      normalizeScores(workingItems, weightKeys);
    }

    const ranked = workingItems.map((item) => {
      let totalScore = 0;
      for (const key of weightKeys) {
        const score = item.scores[key] ?? 0;
        const weight = body.weights[key] ?? 0;
        totalScore += score * weight;
      }
      return { id: item.id, totalScore, scores: item.scores, metadata: item.metadata };
    });

    ranked.sort((a, b) => body.order === "desc" ? b.totalScore - a.totalScore : a.totalScore - b.totalScore);

    const results = body.limit ? ranked.slice(0, body.limit) : ranked;

    sendSuccess(reply, {
      ranked: results,
      count: results.length,
    });
  });
}
