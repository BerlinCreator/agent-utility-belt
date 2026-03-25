import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { apiKeys } from "../db/schema.js";
import { AuthError } from "../utils/errors.js";
import type { Tier } from "../types/index.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKeyId?: string;
    apiKeyTier?: Tier;
    userId?: string;
  }
}

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers["x-api-key"] ?? request.headers.authorization;

  if (!authHeader) {
    throw new AuthError("Missing API key. Provide it via x-api-key header.");
  }

  const key = typeof authHeader === "string"
    ? authHeader.replace(/^Bearer\s+/i, "")
    : authHeader[0]?.replace(/^Bearer\s+/i, "") ?? "";

  if (!key) {
    throw new AuthError("Invalid API key format.");
  }

  const [apiKeyRecord] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.key, key))
    .limit(1);

  if (!apiKeyRecord) {
    throw new AuthError("Invalid API key.");
  }

  if (!apiKeyRecord.isActive) {
    throw new AuthError("API key is deactivated.");
  }

  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    throw new AuthError("API key has expired.");
  }

  request.apiKeyId = apiKeyRecord.id;
  request.apiKeyTier = apiKeyRecord.tier;
  request.userId = apiKeyRecord.userId;
}
