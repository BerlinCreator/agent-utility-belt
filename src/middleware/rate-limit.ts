import type { FastifyRequest, FastifyReply } from "fastify";

export async function usageRateLimitMiddleware(_request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // Daily limit enforcement now happens inside authMiddleware via Supabase.
}
