import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { payrollRuns } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";

const deductionSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().nonnegative(),
  type: z.enum(["fixed", "percentage"]).default("fixed"),
});

const calculateSchema = z.object({
  employeeId: z.string().min(1).max(255),
  employeeName: z.string().max(255).optional(),
  hoursWorked: z.number().positive(),
  hourlyRate: z.number().positive(),
  deductions: z.array(deductionSchema).default([]),
  payPeriodStart: z.string().datetime(),
  payPeriodEnd: z.string().datetime(),
  currency: z.string().length(3).default("USD"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  employeeId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function payrollRoutes(app: FastifyInstance): Promise<void> {
  // POST /calculate — calculate and record a payroll run
  app.post("/calculate", async (request, reply) => {
    const body = calculateSchema.parse(request.body);

    const grossPay = body.hoursWorked * body.hourlyRate;

    const resolvedDeductions = body.deductions.map((d) => ({
      name: d.name,
      amount: d.type === "percentage" ? grossPay * (d.amount / 100) : d.amount,
      type: d.type,
      originalValue: d.amount,
    }));

    const totalDeductions = resolvedDeductions.reduce((sum, d) => sum + d.amount, 0);
    const netPay = grossPay - totalDeductions;

    const [payroll] = await db
      .insert(payrollRuns)
      .values({
        employeeId: body.employeeId,
        employeeName: body.employeeName,
        hoursWorked: body.hoursWorked.toFixed(2),
        hourlyRate: body.hourlyRate.toFixed(2),
        grossPay: grossPay.toFixed(2),
        deductions: resolvedDeductions,
        totalDeductions: totalDeductions.toFixed(2),
        netPay: netPay.toFixed(2),
        payPeriodStart: new Date(body.payPeriodStart),
        payPeriodEnd: new Date(body.payPeriodEnd),
        currency: body.currency,
        metadata: body.metadata,
      })
      .returning();

    sendSuccess(reply, payroll, 201);
  });

  // GET /:id — get payroll run by id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [payroll] = await db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.id, id))
      .limit(1);

    if (!payroll) {
      throw new NotFoundError("Payroll run not found");
    }

    sendSuccess(reply, payroll);
  });

  // GET /list — list payroll runs with pagination
  app.get("/list", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const where = query.employeeId
      ? eq(payrollRuns.employeeId, query.employeeId)
      : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(payrollRuns)
        .where(where)
        .orderBy(desc(payrollRuns.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(payrollRuns)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;

    void reply.send({
      success: true,
      data: rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  });
}
