#!/bin/sh
# Container entrypoint: ensure a stable signing key + schema + bootstrap admin, then run.
set -e

echo "[entrypoint] ensuring RS256 signing key (persisted in /app/keys)..."
node dist/tools/generate-keys.js || echo "[entrypoint] keygen skipped"

echo "[entrypoint] applying database schema (idempotent)..."
node dist/database/migrate.js || echo "[entrypoint] migrate skipped/failed (continuing)"

if [ -n "$BOOTSTRAP_ADMIN_PASSWORD" ]; then
  echo "[entrypoint] seeding bootstrap admin (idempotent)..."
  node dist/database/seed-admin.js || echo "[entrypoint] seed-admin skipped/failed (continuing)"
fi

echo "[entrypoint] starting auth service..."
exec node dist/server.js
