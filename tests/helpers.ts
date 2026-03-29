import { vi } from "vitest";

// Mock ioredis to avoid real Redis connections in tests
vi.mock("ioredis", () => {
  class MockRedis {
    incr = vi.fn().mockResolvedValue(1);
    expire = vi.fn().mockResolvedValue(1);
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue("OK");
    del = vi.fn().mockResolvedValue(1);
    quit = vi.fn().mockResolvedValue("OK");
    eval = vi.fn().mockResolvedValue(1);
    pttl = vi.fn().mockResolvedValue(5000);
    zadd = vi.fn().mockResolvedValue(1);
    zcard = vi.fn().mockResolvedValue(0);
    zrange = vi.fn().mockResolvedValue([]);
    zpopmin = vi.fn().mockResolvedValue([]);
    zremrangebyscore = vi.fn().mockResolvedValue(0);
    sadd = vi.fn().mockResolvedValue(1);
    scard = vi.fn().mockResolvedValue(0);
    srem = vi.fn().mockResolvedValue(1);
    ttl = vi.fn().mockResolvedValue(-1);
    pipeline = vi.fn().mockReturnValue({
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    });
  }
  return { default: MockRedis, Redis: MockRedis };
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
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
        catch: vi.fn().mockReturnValue(Promise.resolve()),
      }),
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  };
  return { db: mockDb, queryClient: { end: vi.fn() } };
});

// Mock supabase to avoid real connections in tests
vi.mock("../src/lib/supabase.js", () => {
  const mockSupabase = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "test-key-id",
              user_id: "test-user-id",
              name: "Test Key",
              key: "test-api-key",
              tier: "free",
              daily_limit: 1000,
              usage_today: 0,
              last_reset: null,
              created_at: new Date().toISOString(),
              is_active: true,
            },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
  return {
    getSupabaseAdmin: vi.fn().mockReturnValue(mockSupabase),
  };
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
    ENCRYPTION_KEY: "0".repeat(64),
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
