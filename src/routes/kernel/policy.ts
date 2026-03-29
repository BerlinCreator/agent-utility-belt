import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { policies } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const conditionSchema: z.ZodType<PolicyCondition> = z.lazy(() =>
  z.object({
    field: z.string().optional(),
    operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "and", "or"]),
    value: z.unknown().optional(),
    conditions: z.array(conditionSchema).optional(),
  }),
);

interface PolicyCondition {
  field?: string;
  operator: string;
  value?: unknown;
  conditions?: PolicyCondition[];
}

const ruleSchema = z.object({
  conditions: conditionSchema,
  action: z.string().min(1),
  priority: z.number().int().default(0),
});

const createPolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  rules: z.array(ruleSchema).min(1),
});

const updatePolicySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional(),
  rules: z.array(ruleSchema).min(1).optional(),
  isActive: z.boolean().optional(),
});

const evaluateSchema = z.object({
  policyId: z.string().min(1),
  context: z.record(z.string(), z.unknown()),
});

export async function policyRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/policy/policy — create a policy
  app.post("/policy", async (request, reply) => {
    const body = createPolicySchema.parse(request.body);

    const [created] = await db
      .insert(policies)
      .values({
        name: body.name,
        description: body.description,
        rules: body.rules,
      })
      .returning();

    sendSuccess(reply, created, 201);
  });

  // POST /v1/policy/evaluate — evaluate a policy against context
  app.post("/evaluate", async (request, reply) => {
    const body = evaluateSchema.parse(request.body);

    const rows = await db
      .select()
      .from(policies)
      .where(eq(policies.id, body.policyId))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Policy '${body.policyId}' not found`);

    const policy = rows[0]!;
    if (!policy.isActive) {
      sendSuccess(reply, { allowed: false, reason: "Policy is inactive", matchedRules: [] });
      return;
    }

    const rules = policy.rules as Array<{ conditions: PolicyCondition; action: string; priority: number }>;
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    const matchedRules: Array<{ action: string; priority: number }> = [];
    for (const rule of sortedRules) {
      if (evaluateCondition(rule.conditions, body.context)) {
        matchedRules.push({ action: rule.action, priority: rule.priority });
      }
    }

    const firstAction = matchedRules[0]?.action ?? null;
    const allowed = firstAction === "allow";

    sendSuccess(reply, {
      allowed,
      action: firstAction,
      matchedRules,
      policyId: body.policyId,
    });
  });

  // GET /v1/policy/policy/:id
  app.get("/policy/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(policies)
      .where(eq(policies.id, id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Policy '${id}' not found`);

    sendSuccess(reply, rows[0]);
  });

  // PUT /v1/policy/policy/:id
  app.put("/policy/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updatePolicySchema.parse(request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.rules !== undefined) updates.rules = body.rules;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const [updated] = await db
      .update(policies)
      .set(updates)
      .where(eq(policies.id, id))
      .returning();

    if (!updated) throw new NotFoundError(`Policy '${id}' not found`);

    sendSuccess(reply, updated);
  });

  // DELETE /v1/policy/policy/:id
  app.delete("/policy/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db.delete(policies).where(eq(policies.id, id)).returning();
    if (!deleted) throw new NotFoundError(`Policy '${id}' not found`);

    sendSuccess(reply, { deleted: true, id });
  });
}

function evaluateCondition(condition: PolicyCondition, context: Record<string, unknown>): boolean {
  const { operator, field, value, conditions } = condition;

  // Logical operators
  if (operator === "and" && conditions) {
    return conditions.every((c) => evaluateCondition(c, context));
  }
  if (operator === "or" && conditions) {
    return conditions.some((c) => evaluateCondition(c, context));
  }

  // Field-based operators
  if (!field) return false;
  const fieldValue = getNestedValue(context, field);

  switch (operator) {
    case "eq":
      return fieldValue === value;
    case "neq":
      return fieldValue !== value;
    case "gt":
      return typeof fieldValue === "number" && typeof value === "number" && fieldValue > value;
    case "gte":
      return typeof fieldValue === "number" && typeof value === "number" && fieldValue >= value;
    case "lt":
      return typeof fieldValue === "number" && typeof value === "number" && fieldValue < value;
    case "lte":
      return typeof fieldValue === "number" && typeof value === "number" && fieldValue <= value;
    case "in":
      return Array.isArray(value) && value.includes(fieldValue);
    case "contains":
      return typeof fieldValue === "string" && typeof value === "string" && fieldValue.includes(value);
    default:
      return false;
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
