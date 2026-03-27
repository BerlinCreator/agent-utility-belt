import type { FastifyRequest, FastifyReply } from "fastify";

export function usageTrackingHook() {
  return async function onResponse(_request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    // Request counting is handled at auth time against Supabase api_keys. Left intentionally light.
  };
}
