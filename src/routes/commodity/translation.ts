import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const translateSchema = z.object({
  text: z.string().min(1).max(10000),
  source: z.string().min(2).max(5).default("auto"),
  target: z.string().min(2).max(5),
});

const detectSchema = z.object({
  text: z.string().min(1).max(10000),
});

export async function translationRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/translate
  app.post("/", async (request, reply) => {
    const params = translateSchema.parse(request.body);

    const result = await callTranslateApi(params.text, params.source, params.target);

    sendSuccess(reply, {
      translatedText: result.translatedText,
      detectedLanguage: result.detectedLanguage,
      source: params.source,
      target: params.target,
    });
  });

  // POST /v1/translate/detect
  app.post("/detect", async (request, reply) => {
    const { text } = detectSchema.parse(request.body);

    const response = await fetch(`${env.LIBRETRANSLATE_URL}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text }),
    });

    if (!response.ok) {
      throw new ValidationError("Language detection failed");
    }

    const data = await response.json() as Array<{ language: string; confidence: number }>;
    sendSuccess(reply, { detections: data });
  });

  // GET /v1/translate/languages
  app.get("/languages", async (_request, reply) => {
    const response = await fetch(`${env.LIBRETRANSLATE_URL}/languages`);

    if (!response.ok) {
      throw new ValidationError("Failed to fetch supported languages");
    }

    const data = await response.json() as Array<{ code: string; name: string }>;
    sendSuccess(reply, { languages: data, count: data.length });
  });
}

interface TranslateResult {
  translatedText: string;
  detectedLanguage: string | null;
}

async function callTranslateApi(text: string, source: string, target: string): Promise<TranslateResult> {
  const response = await fetch(`${env.LIBRETRANSLATE_URL}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: source === "auto" ? undefined : source,
      target,
      format: "text",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ValidationError(`Translation failed: ${errorText}`);
  }

  const data = await response.json() as {
    translatedText: string;
    detectedLanguage?: { language: string };
  };

  return {
    translatedText: data.translatedText,
    detectedLanguage: data.detectedLanguage?.language ?? null,
  };
}
