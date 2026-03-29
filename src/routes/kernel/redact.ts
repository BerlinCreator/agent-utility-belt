import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";

const PATTERNS: Record<string, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b(?:\d[ -]*?){13,19}\b/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  dateOfBirth: /\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g,
};

const processSchema = z.object({
  text: z.string().min(1).max(100000),
  types: z.array(z.enum(["email", "phone", "ssn", "creditCard", "ipv4", "dateOfBirth"])).min(1).default(["email", "phone", "ssn"]),
  replacement: z.string().max(50).default("[REDACTED]"),
  hashReplace: z.boolean().default(false),
});

export async function redactRoutes(app: FastifyInstance): Promise<void> {
  app.post("/process", async (request, reply) => {
    const body = processSchema.parse(request.body);

    let result = body.text;
    const findings: Array<{ type: string; count: number }> = [];

    for (const type of body.types) {
      const pattern = PATTERNS[type];
      if (!pattern) continue;

      const regex = new RegExp(pattern.source, pattern.flags);
      const matches = result.match(regex);
      const count = matches?.length ?? 0;

      if (count > 0) {
        findings.push({ type, count });
        const replacer = body.hashReplace
          ? (_match: string) => `[${type.toUpperCase()}_${Buffer.from(_match).toString("base64").slice(0, 8)}]`
          : body.replacement;
        result = result.replace(regex, replacer as string);
      }
    }

    sendSuccess(reply, {
      redacted: result,
      findings,
      totalRedactions: findings.reduce((sum, f) => sum + f.count, 0),
    });
  });
}
