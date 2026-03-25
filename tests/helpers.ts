import { vi } from "vitest";

// Mock ioredis to avoid real Redis connections in tests
vi.mock("ioredis", () => {
  class MockRedis {
    incr = vi.fn().mockResolvedValue(1);
    expire = vi.fn().mockResolvedValue(1);
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue("OK");
    quit = vi.fn().mockResolvedValue("OK");
  }
  return { default: MockRedis };
});

// Mock the database module before any imports
vi.mock("../src/db/connection.js", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        catch: vi.fn().mockReturnValue(Promise.resolve()),
      }),
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return { db: mockDb, queryClient: { end: vi.fn() } };
});

// Mock env to avoid dotenv issues in test
vi.mock("../src/config/env.js", () => ({
  env: {
    PORT: 3000,
    HOST: "0.0.0.0",
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    RATE_LIMIT_FREE: 100,
    RATE_LIMIT_STARTER: 5000,
    RATE_LIMIT_GROWTH: 50000,
    RATE_LIMIT_BUSINESS: 500000,
    LIBRETRANSLATE_URL: "https://libretranslate.com",
  },
}));

export function createMockApiKey() {
  return {
    id: "test-key-id",
    userId: "test-user-id",
    key: "test-api-key-12345",
    name: "Test Key",
    tier: "free" as const,
    isActive: true,
    callsThisMonth: 0,
    monthlyLimit: 100,
    createdAt: new Date(),
    expiresAt: null,
  };
}
