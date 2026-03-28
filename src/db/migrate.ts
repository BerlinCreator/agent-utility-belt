import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "./connection.js";

async function runMigrations() {
  console.warn("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.warn("Migrations complete.");
  await queryClient.end();
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  // Exit 1 only when run directly (not as background child in docker-entrypoint)
  if (process.ppid === 1) {
    process.exitCode = 1;
  } else {
    process.exit(1);
  }
});
