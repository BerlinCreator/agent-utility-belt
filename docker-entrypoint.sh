#!/bin/sh
set -e

# Run database migrations in background so the app starts immediately
# This allows Railway healthchecks to succeed while migrations run
if [ -d "./drizzle" ] && [ "$(ls -A ./drizzle 2>/dev/null)" ]; then
  echo "Running database migrations in background..."
  node dist/db/migrate.js &
fi

# Start the application immediately
exec node dist/index.js
# force rebuild 1774732159
