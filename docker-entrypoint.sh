#!/bin/sh
set -e

# Run database migrations if the drizzle directory exists
if [ -d "./drizzle" ] && [ "$(ls -A ./drizzle 2>/dev/null)" ]; then
  echo "Running database migrations..."
  node dist/db/migrate.js
  echo "Migrations complete."
fi

# Start the application
exec node dist/index.js
