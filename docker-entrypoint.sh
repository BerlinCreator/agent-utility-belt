#!/bin/sh
set -e

# Run database migrations in background so the app starts immediately.
# Failures are logged but do not kill the server process.
if [ -d "./drizzle" ] && [ "$(ls -A ./drizzle 2>/dev/null)" ]; then
  echo "Running database migrations in background..."
  node dist/db/migrate.js || echo "Migration failed (non-fatal)" &
fi

# Start the application
exec node dist/index.js
