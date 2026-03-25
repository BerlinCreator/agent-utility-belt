import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";

const analyzeSchema = z.object({
  text: z.string().min(1).max(50000),
});

// AFINN-style word list (subset of common sentiment words)
const POSITIVE_WORDS: Record<string, number> = {
  good: 3, great: 3, excellent: 4, amazing: 4, wonderful: 4, fantastic: 4,
  love: 3, happy: 3, joy: 3, beautiful: 3, best: 3, perfect: 4,
  awesome: 4, nice: 2, like: 2, enjoy: 2, brilliant: 4, outstanding: 4,
  superb: 4, delightful: 3, impressive: 3, pleased: 2, glad: 2,
  satisfied: 2, recommend: 2, helpful: 2, easy: 1, fast: 1, clean: 1,
  friendly: 2, fun: 2, useful: 2, reliable: 2, comfortable: 2,
  exciting: 3, innovative: 2, elegant: 3, smooth: 2, solid: 2,
  remarkable: 3, exceptional: 4, magnificent: 4, terrific: 3,
  positive: 2, success: 2, win: 3, favor: 2, fortunate: 2,
  grateful: 2, generous: 2, kind: 2, pleasant: 2, superior: 3,
};

const NEGATIVE_WORDS: Record<string, number> = {
  bad: -3, terrible: -4, horrible: -4, awful: -4, worst: -4, hate: -4,
  poor: -2, ugly: -3, slow: -2, boring: -2, disappointing: -3,
  disappointed: -3, broken: -3, useless: -3, angry: -3, sad: -2,
  annoying: -2, waste: -3, fail: -3, failure: -3, problem: -2,
  difficult: -1, hard: -1, expensive: -2, error: -2, bug: -2,
  crash: -3, frustrating: -3, confusing: -2, complicated: -2,
  mediocre: -2, inferior: -3, weak: -2, damage: -3, pain: -2,
  nasty: -3, dreadful: -4, pathetic: -4, lousy: -3, miserable: -3,
  negative: -2, disgust: -3, fear: -2, wrong: -2, lost: -2,
  unfair: -2, cruel: -3, rude: -2, hostile: -3, toxic: -3,
};

const NEGATION_WORDS = new Set(["not", "no", "never", "neither", "nobody", "nothing", "nowhere", "nor", "cannot", "can't", "don't", "doesn't", "didn't", "won't", "wouldn't", "couldn't", "shouldn't", "isn't", "aren't", "wasn't", "weren't"]);

const INTENSIFIER_WORDS: Record<string, number> = {
  very: 1.5, really: 1.5, extremely: 2, absolutely: 2, totally: 1.5,
  incredibly: 2, remarkably: 1.5, especially: 1.3, quite: 1.2, so: 1.3,
};

interface SentimentResult {
  sentiment: "positive" | "negative" | "neutral";
  score: number;
  confidence: number;
  words: {
    positive: string[];
    negative: string[];
  };
}

function analyzeSentiment(text: string): SentimentResult {
  const words = text.toLowerCase().replace(/[^a-z\s'-]/g, "").split(/\s+/).filter(Boolean);
  let score = 0;
  const positiveFound: string[] = [];
  const negativeFound: string[] = [];
  let wordCount = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const prevWord = i > 0 ? words[i - 1]! : "";
    const prevPrevWord = i > 1 ? words[i - 2]! : "";

    const isNegated = NEGATION_WORDS.has(prevWord) || NEGATION_WORDS.has(prevPrevWord);
    const intensifier = INTENSIFIER_WORDS[prevWord] ?? 1;

    const positiveScore = POSITIVE_WORDS[word];
    if (positiveScore !== undefined) {
      wordCount++;
      if (isNegated) {
        score -= positiveScore * intensifier;
        negativeFound.push(word);
      } else {
        score += positiveScore * intensifier;
        positiveFound.push(word);
      }
      continue;
    }

    const negativeScore = NEGATIVE_WORDS[word];
    if (negativeScore !== undefined) {
      wordCount++;
      if (isNegated) {
        score -= negativeScore * intensifier; // Double negative = positive
        positiveFound.push(word);
      } else {
        score += negativeScore * intensifier;
        negativeFound.push(word);
      }
    }
  }

  // Normalize score to -1 to 1 range
  const maxPossible = Math.max(wordCount * 4, 1);
  const normalizedScore = Math.max(-1, Math.min(1, score / maxPossible));

  // Determine sentiment
  let sentiment: "positive" | "negative" | "neutral";
  if (normalizedScore > 0.05) sentiment = "positive";
  else if (normalizedScore < -0.05) sentiment = "negative";
  else sentiment = "neutral";

  // Confidence based on how many sentiment words found relative to text length
  const totalWords = words.length;
  const sentimentCoverage = totalWords > 0 ? wordCount / totalWords : 0;
  const confidence = Math.min(1, Math.round(
    (Math.abs(normalizedScore) * 0.6 + sentimentCoverage * 0.4) * 100,
  ) / 100);

  return {
    sentiment,
    score: Math.round(normalizedScore * 1000) / 1000,
    confidence,
    words: {
      positive: [...new Set(positiveFound)],
      negative: [...new Set(negativeFound)],
    },
  };
}

export async function sentimentRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/sentiment/analyze
  app.post("/analyze", async (request, reply) => {
    const { text } = analyzeSchema.parse(request.body);
    const result = analyzeSentiment(text);
    sendSuccess(reply, result);
  });
}
