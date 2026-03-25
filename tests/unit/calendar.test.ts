import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import "../helpers.js";
import { buildApp } from "../../src/index.js";
import type { FastifyInstance } from "fastify";
import { db } from "../../src/db/connection.js";

let app: FastifyInstance;

function mockValidApiKey() {
  const mockApiKey = {
    id: "test-key-id",
    userId: "test-user-id",
    key: "valid-test-key",
    tier: "free",
    isActive: true,
    callsThisMonth: 0,
    monthlyLimit: 100,
    createdAt: new Date(),
    expiresAt: null,
  };

  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([mockApiKey]),
      }),
    }),
  } as ReturnType<typeof db.select>);

  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  } as ReturnType<typeof db.update>);
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  mockValidApiKey();
});

describe("Calendar Availability API", () => {
  describe("POST /v1/calendar/check", () => {
    it("should return available slots for a day", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/check",
        headers: { "x-api-key": "valid-test-key" },
        payload: {
          timezone: "America/New_York",
          date: "2026-04-01",
          duration: 60,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.date).toBe("2026-04-01");
      expect(body.data.timezone).toBe("America/New_York");
      expect(body.data.slots.length).toBeGreaterThan(0);
      expect(body.data.totalSlots).toBe(8); // 9-17 with 60min slots = 8
    });

    it("should respect custom working hours", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/check",
        headers: { "x-api-key": "valid-test-key" },
        payload: {
          timezone: "UTC",
          date: "2026-04-01",
          duration: 30,
          workingHours: { start: "10:00", end: "12:00" },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.totalSlots).toBe(4); // 10-12 with 30min slots = 4
    });

    it("should reject invalid timezone", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/check",
        headers: { "x-api-key": "valid-test-key" },
        payload: {
          timezone: "Invalid/Timezone",
          date: "2026-04-01",
          duration: 60,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
