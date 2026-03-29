import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { escalations } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const createSchema = z.object({
  level: z.enum(["low", "medium", "high", "critical"]),
  context: z.string().min(1).max(5000),
  deadline: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const LEVEL_ORDER = ["low", "medium", "high", "critical"] as const;

export async function escalationRoutes(app: FastifyInstance): Promise<void> {
  // POST /create — create an escalation
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);

    const [created] = await db
      .insert(escalations)
      .values({
        level: body.level,
        context: body.context,
        deadline: body.deadline ? new Date(body.deadline) : undefined,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // PUT /:id/escalate — bump the escalation level
  app.put("/:id/escalate", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db.select().from(escalations).where(eq(escalations.id, id)).limit(1);
    if (rows.length === 0) throw new NotFoundError(`Escalation '${id}' not found`);

    const current = rows[0]!;
    if (current.status === "resolved") {
      throw new ValidationError("Cannot escalate a resolved issue");
    }

    const currentIdx = LEVEL_ORDER.indexOf(current.level);
    if (currentIdx >= LEVEL_ORDER.length - 1) {
      throw new ValidationError("Already at maximum escalation level");
    }

    const nextLevel = LEVEL_ORDER[currentIdx + 1]!;
    const [updated] = await db
      .update(escalations)
      .set({ level: nextLevel, status: "escalated", updatedAt: new Date() })
      .where(eq(escalations.id, id))
      .returning();

    sendSuccess(reply, updated);
  });

  // PUT /:id/resolve — resolve an escalation
  app.put("/:id/resolve", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db.select().from(escalations).where(eq(escalations.id, id)).limit(1);
    if (rows.length === 0) throw new NotFoundError(`Escalation '${id}' not found`);
    if (rows[0]!.status === "resolved") {
      throw new ValidationError("Escalation is already resolved");
    }

    const [updated] = await db
      .update(escalations)
      .set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(escalations.id, id))
      .returning();

    sendSuccess(reply, updated);
  });

  // GET /:id — get an escalation
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db.select().from(escalations).where(eq(escalations.id, id)).limit(1);
    if (rows.length === 0) throw new NotFoundError(`Escalation '${id}' not found`);

    const esc = rows[0]!;
    const isOverdue = esc.deadline && esc.status !== "resolved" && new Date() > esc.deadline;

    sendSuccess(reply, { ...esc, isOverdue: !!isOverdue });
  });

  // GET /list — list escalations
  app.get("/list", async (request, reply) => {
    const rows = await db.select().from(escalations).orderBy(desc(escalations.createdAt)).limit(100);
    sendSuccess(reply, rows);
  });
}
