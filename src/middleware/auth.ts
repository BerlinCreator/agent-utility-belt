import type { FastifyRequest, FastifyReply } from "fastify";
import { AuthError, RateLimitError } from "../utils/errors.js";
import type { Tier } from "../types/index.js";
import { getSupabaseAdmin, type ApiKeyRecord } from "../lib/supabase.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKeyId?: string;
    apiKeyTier?: Tier;
    userId?: string;
  }
}

function startOfUtcDayIso() {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString();
}

async function loadApiKeyRecord(key: string): Promise<ApiKeyRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id,user_id,name,key,tier,daily_limit,usage_today,last_reset,created_at,is_active")
    .eq("key", key)
    .maybeSingle<ApiKeyRecord>();

  if (error) {
    throw new AuthError(`Failed to validate API key: ${error.message}`);
  }

  return data;
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

  const apiKeyRecord = await loadApiKeyRecord(key);

  if (!apiKeyRecord) {
    throw new AuthError("Invalid API key.");
  }

  if (!apiKeyRecord.is_active) {
    throw new AuthError("API key is deactivated.");
  }

  const todayIso = startOfUtcDayIso();
  const needsReset = !apiKeyRecord.last_reset || apiKeyRecord.last_reset < todayIso;
  const usageToday = needsReset ? 0 : apiKeyRecord.usage_today;

  if (usageToday >= apiKeyRecord.daily_limit) {
    throw new RateLimitError(
      `Daily limit of ${apiKeyRecord.daily_limit} calls exceeded. Try again tomorrow or upgrade your tier.`,
    );
  }

  const nextUsage = usageToday + 1;
  const { error: updateError } = await getSupabaseAdmin()
    .from("api_keys")
    .update({
      usage_today: nextUsage,
      last_reset: todayIso,
    })
    .eq("id", apiKeyRecord.id);

  if (updateError) {
    throw new AuthError(`Failed to update API key usage: ${updateError.message}`);
  }

  request.apiKeyId = apiKeyRecord.id;
  request.apiKeyTier = apiKeyRecord.tier as Tier;
  request.userId = apiKeyRecord.user_id;
}
