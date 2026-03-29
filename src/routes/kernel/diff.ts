import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { diffChars, diffWords, diffLines, createPatch } from "diff";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const compareSchema = z.object({
  left: z.string(),
  right: z.string(),
  mode: z.enum(["chars", "words", "lines", "patch"]).default("lines"),
  context: z.number().int().min(0).max(50).default(3),
});

export async function diffRoutes(app: FastifyInstance): Promise<void> {
  app.post("/compare", async (request, reply) => {
    const body = compareSchema.parse(request.body);

    if (body.left === body.right) {
      sendSuccess(reply, { identical: true, changes: [], stats: { additions: 0, deletions: 0, unchanged: 0 } });
      return;
    }

    let changes;
    switch (body.mode) {
      case "chars":
        changes = diffChars(body.left, body.right);
        break;
      case "words":
        changes = diffWords(body.left, body.right);
        break;
      case "lines":
        changes = diffLines(body.left, body.right);
        break;
      case "patch": {
        const patch = createPatch("file", body.left, body.right, "", "", { context: body.context });
        sendSuccess(reply, { identical: false, patch });
        return;
      }
      default:
        throw new ValidationError(`Unknown mode: ${body.mode as string}`);
    }

    const stats = { additions: 0, deletions: 0, unchanged: 0 };
    for (const c of changes) {
      if (c.added) stats.additions += c.count ?? 0;
      else if (c.removed) stats.deletions += c.count ?? 0;
      else stats.unchanged += c.count ?? 0;
    }

    sendSuccess(reply, {
      identical: false,
      changes: changes.map((c) => ({ value: c.value, added: c.added ?? false, removed: c.removed ?? false, count: c.count })),
      stats,
    });
  });
}
