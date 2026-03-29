import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const extractSchema = z.object({
  text: z.string().min(1).max(50000),
});

interface Entity {
  text: string;
  type: string;
  start: number;
  end: number;
}

const PATTERNS: { type: string; regex: RegExp }[] = [
  { type: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: "phone", regex: /\+?\d[\d\s\-().]{7,}\d/g },
  { type: "url", regex: /https?:\/\/[^\s,;)"'<>]+/g },
  { type: "ip_address", regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { type: "date", regex: /\b\d{4}-\d{2}-\d{2}\b/g },
  { type: "currency", regex: /\$[\d,]+\.?\d{0,2}\b/g },
  { type: "percentage", regex: /\b\d+\.?\d*%/g },
  { type: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "credit_card", regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
  { type: "hashtag", regex: /#[a-zA-Z]\w{1,}/g },
  { type: "mention", regex: /@[a-zA-Z]\w{1,}/g },
];

function extractEntities(text: string): Entity[] {
  const entities: Entity[] = [];

  for (const { type, regex } of PATTERNS) {
    const pattern = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Sort by position
  entities.sort((a, b) => a.start - b.start);
  return entities;
}

export async function entityRoutes(app: FastifyInstance): Promise<void> {
  app.post("/extract", async (request, reply) => {
    const body = extractSchema.parse(request.body);

    if (body.text.trim().length === 0) {
      throw new ValidationError("Text cannot be empty or whitespace only");
    }

    const entities = extractEntities(body.text);
    const typeCounts: Record<string, number> = {};
    for (const e of entities) {
      typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;
    }

    sendSuccess(reply, {
      entities,
      count: entities.length,
      types: typeCounts,
    });
  });
}
