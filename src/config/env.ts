import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().url().default("postgres://postgres:postgres@localhost:5432/agent_utility_belt"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  RATE_LIMIT_FREE: z.coerce.number().default(100),
  RATE_LIMIT_STARTER: z.coerce.number().default(5000),
  RATE_LIMIT_GROWTH: z.coerce.number().default(50000),
  RATE_LIMIT_BUSINESS: z.coerce.number().default(500000),
  EXCHANGE_RATE_API_KEY: z.string().optional(),
  LIBRETRANSLATE_URL: z.string().default("https://libretranslate.com"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    console.error("Invalid environment variables:", formatted);
    throw new Error("Invalid environment variables");
  }
  return result.data;
}

export const env = loadEnv();
