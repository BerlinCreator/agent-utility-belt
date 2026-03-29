import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Ledger API", () => {
  it("POST /v1/ledger/entry creates a double-entry transaction", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "entry-1", transactionId: "TXN-abc", accountId: "acc-1",
          type: "debit", amount: "100.00",
        }]),
      }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/ledger/entry", headers,
      payload: {
        entries: [
          { accountId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", type: "debit", amount: 100 },
          { accountId: "b290f1ee-6c54-4b01-90e6-d701748f0852", type: "credit", amount: 100 },
        ],
        description: "Test transaction",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.transactionId).toBeDefined();
    expect(body.data.entries).toHaveLength(2);
  });

  it("POST /v1/ledger/entry rejects imbalanced entries", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/ledger/entry", headers,
      payload: {
        entries: [
          { accountId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", type: "debit", amount: 100 },
          { accountId: "b290f1ee-6c54-4b01-90e6-d701748f0852", type: "credit", amount: 50 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /v1/ledger/entry requires minimum 2 entries", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/ledger/entry", headers,
      payload: {
        entries: [
          { accountId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", type: "debit", amount: 100 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /v1/ledger/balance/:accountId returns account balance", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", name: "Cash",
            type: "asset", balance: "1000.00", currency: "USD",
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/ledger/balance/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", headers });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.balance).toBe("1000.00");
    expect(body.data.name).toBe("Cash");
  });

  it("GET /v1/ledger/balance/:accountId returns 404 for unknown account", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/ledger/balance/c290f1ee-6c54-4b01-90e6-d701748f0899", headers });
    expect(res.statusCode).toBe(404);
  });

  it("GET /v1/ledger/entries returns paginated entries", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;

    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount % 2 === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
              }),
            }),
          }),
        };
      }
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: 0 }]) }) };
    });

    const res = await app.inject({ method: "GET", url: "/v1/ledger/entries?page=1&limit=10", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).pagination).toBeDefined();
  });

  it("GET /v1/ledger/trial-balance returns all account balances", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([
          { id: "acc-1", name: "Cash", type: "asset", balance: "1000.00" },
          { id: "acc-2", name: "Revenue", type: "revenue", balance: "-1000.00" },
        ]),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/ledger/trial-balance", headers });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.accounts).toHaveLength(2);
    expect(body.data.isBalanced).toBe(true);
    expect(body.data.totalDebits).toBe("1000.00");
    expect(body.data.totalCredits).toBe("1000.00");
  });
});
