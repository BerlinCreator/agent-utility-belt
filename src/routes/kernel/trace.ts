import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { traces, spans } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const startSchema = z.object({
  name: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const spanSchema = z.object({
  traceId: z.string().uuid(),
  parentSpanId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  status: z.enum(["ok", "error", "timeout"]).default("ok"),
  durationMs: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function traceRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/trace/start — create a new trace
  app.post("/start", async (request, reply) => {
    const body = startSchema.parse(request.body);

    const [created] = await db
      .insert(traces)
      .values({
        name: body.name,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // POST /v1/trace/span — add a span to a trace
  app.post("/span", async (request, reply) => {
    const body = spanSchema.parse(request.body);

    // verify trace exists
    const existing = await db
      .select()
      .from(traces)
      .where(eq(traces.id, body.traceId))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundError(`Trace '${body.traceId}' not found`);
    }

    const now = new Date();
    const startedAt = body.durationMs !== undefined
      ? new Date(now.getTime() - body.durationMs)
      : now;

    const [created] = await db
      .insert(spans)
      .values({
        traceId: body.traceId,
        parentSpanId: body.parentSpanId,
        name: body.name,
        status: body.status,
        durationMs: body.durationMs,
        metadata: body.metadata,
        startedAt,
        endedAt: body.durationMs !== undefined ? now : undefined,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // GET /v1/trace/:traceId — get trace with all spans
  app.get("/:traceId", async (request, reply) => {
    const { traceId } = request.params as { traceId: string };

    const traceRows = await db
      .select()
      .from(traces)
      .where(eq(traces.id, traceId))
      .limit(1);

    if (traceRows.length === 0) {
      throw new NotFoundError(`Trace '${traceId}' not found`);
    }

    const spanRows = await db
      .select()
      .from(spans)
      .where(eq(spans.traceId, traceId));

    sendSuccess(reply, {
      trace: traceRows[0],
      spans: spanRows,
      spanCount: spanRows.length,
    });
  });
}
