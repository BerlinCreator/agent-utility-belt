import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const headers = { "x-api-key": "test-api-key" };

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe("Payroll API", () => {
  it("POST /v1/payroll/calculate returns 201 with correct gross/net pay", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "payroll-1", employeeId: "emp-1", employeeName: "John Doe",
          hoursWorked: "40.00", hourlyRate: "25.00", grossPay: "1000.00",
          deductions: [{ name: "Tax", amount: 200, type: "fixed", originalValue: 200 }],
          totalDeductions: "200.00", netPay: "800.00",
          payPeriodStart: "2026-03-01T00:00:00.000Z", payPeriodEnd: "2026-03-15T00:00:00.000Z",
          currency: "USD", metadata: null, createdAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/payroll/calculate", headers,
      payload: {
        employeeId: "emp-1", employeeName: "John Doe",
        hoursWorked: 40, hourlyRate: 25,
        deductions: [{ name: "Tax", amount: 200, type: "fixed" }],
        payPeriodStart: "2026-03-01T00:00:00.000Z",
        payPeriodEnd: "2026-03-15T00:00:00.000Z",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.grossPay).toBe("1000.00");
    expect(body.data.netPay).toBe("800.00");
  });

  it("POST /v1/payroll/calculate handles percentage deductions", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "payroll-2", employeeId: "emp-2", employeeName: "Jane Smith",
          hoursWorked: "40.00", hourlyRate: "50.00", grossPay: "2000.00",
          deductions: [{ name: "Tax", amount: 400, type: "percentage", originalValue: 20 }],
          totalDeductions: "400.00", netPay: "1600.00",
          payPeriodStart: "2026-03-01T00:00:00.000Z", payPeriodEnd: "2026-03-15T00:00:00.000Z",
          currency: "USD", metadata: null, createdAt: new Date().toISOString(),
        }]),
      }),
    });

    const res = await app.inject({
      method: "POST", url: "/v1/payroll/calculate", headers,
      payload: {
        employeeId: "emp-2", employeeName: "Jane Smith",
        hoursWorked: 40, hourlyRate: 50,
        deductions: [{ name: "Tax", amount: 20, type: "percentage" }],
        payPeriodStart: "2026-03-01T00:00:00.000Z",
        payPeriodEnd: "2026-03-15T00:00:00.000Z",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.totalDeductions).toBe("400.00");
    expect(body.data.netPay).toBe("1600.00");
  });

  it("POST /v1/payroll/calculate validates hoursWorked must be positive", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/payroll/calculate", headers,
      payload: {
        employeeId: "emp-1", hoursWorked: -5, hourlyRate: 25,
        payPeriodStart: "2026-03-01T00:00:00.000Z",
        payPeriodEnd: "2026-03-15T00:00:00.000Z",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /v1/payroll/:id returns payroll run", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "d290f1ee-6c54-4b01-90e6-d701748f0851", employeeId: "emp-1",
            employeeName: "John Doe", grossPay: "1000.00", netPay: "800.00",
            createdAt: new Date().toISOString(),
          }]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/payroll/d290f1ee-6c54-4b01-90e6-d701748f0851", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.employeeId).toBe("emp-1");
  });

  it("GET /v1/payroll/:id returns 404 for unknown payroll run", async () => {
    const { db } = await import("../../src/db/connection.js");
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.inject({ method: "GET", url: "/v1/payroll/c290f1ee-6c54-4b01-90e6-d701748f0899", headers });
    expect(res.statusCode).toBe(404);
  });

  it("GET /v1/payroll/list returns paginated results", async () => {
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

    const res = await app.inject({ method: "GET", url: "/v1/payroll/list?page=1&limit=10", headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).pagination).toBeDefined();
  });
});
