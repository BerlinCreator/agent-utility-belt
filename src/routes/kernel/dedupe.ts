import type { FastifyInstance } from "fastify";
import { z } from "zod";
import levenshtein from "fast-levenshtein";
import { sendSuccess } from "../../utils/response.js";

const matchSchema = z.object({
  items: z.array(z.string()).min(1).max(10000),
  threshold: z.number().min(0).max(1).default(0.8),
  caseSensitive: z.boolean().default(false),
  returnGroups: z.boolean().default(true),
});

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein.get(a, b);
  return 1 - dist / maxLen;
}

export async function dedupeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/match", async (request, reply) => {
    const body = matchSchema.parse(request.body);

    const items = body.caseSensitive ? body.items : body.items.map((s) => s.toLowerCase());
    const originals = body.items;

    const assigned = new Set<number>();
    const groups: Array<{ canonical: string; members: string[]; similarity: number[] }> = [];
    const duplicates: Array<{ original: string; duplicate: string; similarity: number }> = [];

    for (let i = 0; i < items.length; i++) {
      if (assigned.has(i)) continue;
      assigned.add(i);

      const group: { canonical: string; members: string[]; similarity: number[] } = {
        canonical: originals[i]!,
        members: [originals[i]!],
        similarity: [1],
      };

      for (let j = i + 1; j < items.length; j++) {
        if (assigned.has(j)) continue;
        const sim = similarity(items[i]!, items[j]!);
        if (sim >= body.threshold) {
          assigned.add(j);
          group.members.push(originals[j]!);
          group.similarity.push(sim);
          duplicates.push({ original: originals[i]!, duplicate: originals[j]!, similarity: sim });
        }
      }

      groups.push(group);
    }

    const unique = groups.map((g) => g.canonical);

    sendSuccess(reply, {
      unique,
      ...(body.returnGroups && { groups }),
      duplicates,
      stats: {
        inputCount: originals.length,
        uniqueCount: unique.length,
        duplicateCount: originals.length - unique.length,
      },
    });
  });
}
