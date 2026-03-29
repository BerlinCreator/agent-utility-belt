import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const APPROX_CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

const truncateSchema = z.object({
  text: z.string().min(1),
  maxTokens: z.number().int().min(1),
  strategy: z.enum(["end", "start", "middle"]).default("end"),
  ellipsis: z.string().max(50).default("..."),
});

const countSchema = z.object({
  text: z.string(),
  unit: z.enum(["tokens", "chars", "words", "lines", "sentences"]).default("tokens"),
});

const sliceSchema = z.object({
  text: z.string().min(1),
  startToken: z.number().int().min(0).default(0),
  endToken: z.number().int().min(1).optional(),
});

export async function contextRoutes(app: FastifyInstance): Promise<void> {
  app.post("/truncate", async (request, reply) => {
    const body = truncateSchema.parse(request.body);

    const currentTokens = estimateTokens(body.text);
    if (currentTokens <= body.maxTokens) {
      sendSuccess(reply, {
        text: body.text,
        truncated: false,
        originalTokens: currentTokens,
        resultTokens: currentTokens,
      });
      return;
    }

    const maxChars = body.maxTokens * APPROX_CHARS_PER_TOKEN;
    let result: string;

    switch (body.strategy) {
      case "end":
        result = body.text.slice(0, maxChars) + body.ellipsis;
        break;
      case "start":
        result = body.ellipsis + body.text.slice(-maxChars);
        break;
      case "middle": {
        const half = Math.floor(maxChars / 2);
        result = body.text.slice(0, half) + body.ellipsis + body.text.slice(-half);
        break;
      }
      default:
        throw new ValidationError(`Unknown strategy: ${body.strategy as string}`);
    }

    sendSuccess(reply, {
      text: result,
      truncated: true,
      originalTokens: currentTokens,
      resultTokens: estimateTokens(result),
    });
  });

  app.post("/count", async (request, reply) => {
    const body = countSchema.parse(request.body);

    let count: number;
    switch (body.unit) {
      case "tokens":
        count = estimateTokens(body.text);
        break;
      case "chars":
        count = body.text.length;
        break;
      case "words":
        count = body.text.split(/\s+/).filter((w) => w.length > 0).length;
        break;
      case "lines":
        count = body.text.split("\n").length;
        break;
      case "sentences":
        count = body.text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
        break;
      default:
        throw new ValidationError(`Unknown unit: ${body.unit as string}`);
    }

    sendSuccess(reply, {
      count,
      unit: body.unit,
    });
  });

  app.post("/slice", async (request, reply) => {
    const body = sliceSchema.parse(request.body);

    const startChar = body.startToken * APPROX_CHARS_PER_TOKEN;
    const endChar = body.endToken ? body.endToken * APPROX_CHARS_PER_TOKEN : undefined;

    if (startChar >= body.text.length) {
      throw new ValidationError("startToken is beyond the text length");
    }

    const sliced = body.text.slice(startChar, endChar);

    sendSuccess(reply, {
      text: sliced,
      startToken: body.startToken,
      endToken: body.endToken ?? estimateTokens(body.text),
      tokens: estimateTokens(sliced),
    });
  });
}
