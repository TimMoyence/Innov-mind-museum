#!/usr/bin/env bash
# Phase 2 — Maestro runner setup.
# Boots the docker-compose backend (Postgres + API) and waits for /api/health.
#
# Usage: maestro-runner-setup.sh
#   No arguments. Reads from cwd; expects museum-backend/ to be at ../museum-backend.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "[setup] starting docker-compose backend stack…"
cd "$REPO_ROOT/museum-backend"
docker compose -f docker-compose.dev.yml up -d
cd "$REPO_ROOT/museum-backend"

# Install backend deps + run migrations (Phase 2 requires real schema for flows that hit /api/auth/register)
echo "[setup] installing backend deps…"
corepack enable
pnpm install --frozen-lockfile

echo "[setup] running migrations…"
DB_HOST=localhost DB_PORT=5433 DB_USER=museum_dev DB_PASSWORD=museum_dev_password PGDATABASE=museum_dev \
  pnpm migration:run

# Start the backend API in the background, log to /tmp/backend.log
echo "[setup] starting backend API…"
DB_HOST=localhost DB_PORT=5433 DB_USER=museum_dev DB_PASSWORD=museum_dev_password PGDATABASE=museum_dev \
  PORT=3000 \
  JWT_ACCESS_SECRET=phase2-e2e-access JWT_REFRESH_SECRET=phase2-e2e-refresh \
  CORS_ORIGINS=http://localhost:8081 \
  pnpm dev > /tmp/backend.log 2>&1 &

# Wait for /api/health up to 120s
echo "[setup] waiting for /api/health…"
for i in $(seq 1 120); do
  if curl -fsS http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "[setup] backend ready after ${i}s"
    exit 0
  fi
  sleep 1
done

echo "[setup] backend did NOT come up in 120s — last 30 lines of log:"
tail -30 /tmp/backend.log || true
exit 1
