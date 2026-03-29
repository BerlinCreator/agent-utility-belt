import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { disputes } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const createSchema = z.object({
  parties: z.array(z.string().min(1)).min(2),
  reason: z.string().min(1).max(5000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const statusSchema = z.object({
  status: z.enum(["open", "review", "resolved"]),
  resolution: z.string().max(5000).optional(),
});

// Valid state transitions: open → review → resolved
const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["review"],
  review: ["resolved"],
  resolved: [],
};

export async function disputeRoutes(app: FastifyInstance): Promise<void> {
  // POST /create — create a dispute
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);

    const [created] = await db
      .insert(disputes)
      .values({
        parties: body.parties,
        reason: body.reason,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // PUT /:id/status — transition dispute status
  app.put("/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = statusSchema.parse(request.body);

    const rows = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
    if (rows.length === 0) throw new NotFoundError(`Dispute '${id}' not found`);

    const current = rows[0]!;
    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(body.status)) {
      throw new ValidationError(
        `Cannot transition from '${current.status}' to '${body.status}'. Allowed: ${allowed.join(", ") || "none"}`,
      );
    }

    const [updated] = await db
      .update(disputes)
      .set({
        status: body.status,
        resolution: body.resolution ?? current.resolution,
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, id))
      .returning();

    sendSuccess(reply, updated);
  });

  // GET /:id — get a dispute
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
    if (rows.length === 0) throw new NotFoundError(`Dispute '${id}' not found`);

    sendSuccess(reply, rows[0]);
  });

  // GET /list — list disputes
  app.get("/list", async (request, reply) => {
    const rows = await db.select().from(disputes).orderBy(desc(disputes.createdAt)).limit(100);
    sendSuccess(reply, rows);
  });
}
