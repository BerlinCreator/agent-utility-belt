import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const extractSchema = z.object({
  text: z.string().min(1).max(500000),
  sentences: z.number().int().min(1).max(50).default(3),
  algorithm: z.enum(["tfidf", "frequency"]).default("tfidf"),
});

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 0);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function computeTfIdf(sentences: string[]): Map<string, Map<string, number>> {
  const tf = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();

  for (const sentence of sentences) {
    const words = tokenize(sentence);
    const wordFreq = new Map<string, number>();
    const seen = new Set<string>();

    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
      if (!seen.has(word)) {
        df.set(word, (df.get(word) ?? 0) + 1);
        seen.add(word);
      }
    }

    const totalWords = words.length || 1;
    const normalized = new Map<string, number>();
    for (const [word, count] of wordFreq) {
      normalized.set(word, count / totalWords);
    }
    tf.set(sentence, normalized);
  }

  const numDocs = sentences.length;
  const tfidf = new Map<string, Map<string, number>>();

  for (const [sentence, wordTf] of tf) {
    const scores = new Map<string, number>();
    for (const [word, tfVal] of wordTf) {
      const idf = Math.log(numDocs / (1 + (df.get(word) ?? 0)));
      scores.set(word, tfVal * idf);
    }
    tfidf.set(sentence, scores);
  }

  return tfidf;
}

function scoreSentences(sentences: string[], algorithm: string): Array<{ sentence: string; score: number; index: number }> {
  if (algorithm === "tfidf") {
    const tfidf = computeTfIdf(sentences);
    return sentences.map((sentence, index) => {
      const scores = tfidf.get(sentence);
      let total = 0;
      if (scores) {
        for (const val of scores.values()) total += val;
      }
      return { sentence, score: total, index };
    });
  }

  // frequency-based
  const allWords = tokenize(sentences.join(" "));
  const freq = new Map<string, number>();
  for (const word of allWords) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  return sentences.map((sentence, index) => {
    const words = tokenize(sentence);
    let score = 0;
    for (const word of words) {
      score += freq.get(word) ?? 0;
    }
    return { sentence, score: words.length > 0 ? score / words.length : 0, index };
  });
}

export async function summarizeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/extract", async (request, reply) => {
    const body = extractSchema.parse(request.body);

    const sentences = splitSentences(body.text);
    if (sentences.length === 0) {
      throw new ValidationError("No sentences found in input text");
    }

    const scored = scoreSentences(sentences, body.algorithm);
    scored.sort((a, b) => b.score - a.score);

    const topCount = Math.min(body.sentences, sentences.length);
    const topSentences = scored.slice(0, topCount);

    // restore original order
    topSentences.sort((a, b) => a.index - b.index);

    sendSuccess(reply, {
      summary: topSentences.map((s) => s.sentence).join(" "),
      sentences: topSentences,
      stats: {
        originalSentences: sentences.length,
        selectedSentences: topSentences.length,
        compressionRatio: topSentences.length / sentences.length,
      },
    });
  });
}
