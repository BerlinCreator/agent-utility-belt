import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../db/connection.js";
import { ledgerAccounts, ledgerEntries } from "../../db/schema.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const entryLineSchema = z.object({
  accountId: z.string().uuid(),
  type: z.enum(["debit", "credit"]),
  amount: z.number().positive(),
});

const entrySchema = z.object({
  entries: z.array(entryLineSchema).min(2),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const entriesQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function ledgerRoutes(app: FastifyInstance): Promise<void> {
  // POST /entry — create a double-entry transaction
  app.post("/entry", async (request, reply) => {
    const body = entrySchema.parse(request.body);

    // Validate double-entry: total debits must equal total credits
    const totalDebits = body.entries
      .filter((e) => e.type === "debit")
      .reduce((sum, e) => sum + e.amount, 0);
    const totalCredits = body.entries
      .filter((e) => e.type === "credit")
      .reduce((sum, e) => sum + e.amount, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.001) {
      throw new ValidationError(
        `Debits (${totalDebits.toFixed(2)}) must equal credits (${totalCredits.toFixed(2)})`,
      );
    }

    const transactionId = `TXN-${nanoid(12)}`;

    const created = [];
    for (const entry of body.entries) {
      const [row] = await db
        .insert(ledgerEntries)
        .values({
          transactionId,
          accountId: entry.accountId,
          type: entry.type,
          amount: entry.amount.toFixed(2),
          description: body.description,
          metadata: body.metadata,
        })
        .returning();
      created.push(row);

      // Update account balance: debits increase asset/expense, credits increase liability/revenue
      const balanceChange = entry.type === "debit"
        ? entry.amount.toFixed(2)
        : (-entry.amount).toFixed(2);

      await db
        .update(ledgerAccounts)
        .set({
          balance: sql`${ledgerAccounts.balance} + ${balanceChange}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccounts.id, entry.accountId));
    }

    sendSuccess(reply, { transactionId, entries: created }, 201);
  });

  // GET /balance/:accountId — get account balance
  app.get("/balance/:accountId", async (request, reply) => {
    const { accountId } = z
      .object({ accountId: z.string().uuid() })
      .parse(request.params);

    const [account] = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new NotFoundError("Account not found");
    }

    sendSuccess(reply, {
      accountId: account.id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency: account.currency,
    });
  });

  // GET /entries — list ledger entries with pagination
  app.get("/entries", async (request, reply) => {
    const query = entriesQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const where = query.accountId
      ? eq(ledgerEntries.accountId, query.accountId)
      : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(ledgerEntries)
        .where(where)
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(ledgerEntries)
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

  // GET /trial-balance — get trial balance across all accounts
  app.get("/trial-balance", async (request, reply) => {
    const accounts = await db
      .select()
      .from(ledgerAccounts)
      .orderBy(ledgerAccounts.name);

    const totalDebits = accounts
      .filter((a) => parseFloat(a.balance) >= 0)
      .reduce((sum, a) => sum + parseFloat(a.balance), 0);

    const totalCredits = accounts
      .filter((a) => parseFloat(a.balance) < 0)
      .reduce((sum, a) => sum + Math.abs(parseFloat(a.balance)), 0);

    sendSuccess(reply, {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: a.balance,
      })),
      totalDebits: totalDebits.toFixed(2),
      totalCredits: totalCredits.toFixed(2),
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
    });
  });
}
