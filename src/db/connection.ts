import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

const isProduction = env.NODE_ENV === "production";

const queryClient = postgres(env.DATABASE_URL, {
  max: isProduction ? 20 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Railway/Supabase managed Postgres requires SSL in production.
  // postgres-js reads sslmode from the URL, but we enforce it here as a safety net.
  ssl: isProduction ? "require" : false,
  // Prepare statements can cause issues with some connection poolers (e.g. PgBouncer).
  // Disable in production if using an external pooler; safe for direct connections.
  prepare: !env.DATABASE_DISABLE_PREPARE,
});

export const db = drizzle(queryClient, { schema });
export { queryClient };
