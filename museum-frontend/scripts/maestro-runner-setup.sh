#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-museum_dev}"
DB_PASSWORD="${DB_PASSWORD:-museum_dev_password}"
PGDATABASE="${PGDATABASE:-museum_dev}"

if [ -z "${SKIP_DOCKER_COMPOSE:-}" ]; then
  echo "[setup] starting docker-compose backend stack…"
  cd "$REPO_ROOT/museum-backend"
  docker compose -f docker-compose.dev.yml up -d
else
  echo "[setup] SKIP_DOCKER_COMPOSE=1 — assuming Postgres ${DB_HOST}:${DB_PORT} is up"
fi
cd "$REPO_ROOT/museum-backend"

echo "[setup] installing backend deps…"
corepack enable
pnpm install --frozen-lockfile

echo "[setup] running migrations…"
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" PGDATABASE="$PGDATABASE" \
  pnpm migration:run

echo "[setup] seeding demo museums…"
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" PGDATABASE="$PGDATABASE" \
  pnpm seed:museums

if [ "${CHAT_COMPARE_PROVISION:-}" = "1" ]; then
  echo "[setup] CHAT_COMPARE_PROVISION=1 — provisioning SigLIP encoder + fixture embedding (best-effort)…"
  if bash scripts/pull-siglip-model.sh \
    && DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" PGDATABASE="$PGDATABASE" \
      EMBEDDINGS_PROVIDER=siglip-onnx \
      pnpm catalog:ingest -- --from-csv="$REPO_ROOT/museum-frontend/.maestro/fixtures/catalog.csv"; then
    echo "[setup] SigLIP provisioning OK — chat-compare can reach a real match"
  else
    echo "[setup] WARN: SigLIP provisioning failed (ghcr.io login / catalog ingest) — /chat/compare will 503 and chat-compare.yaml fails-loud; backend boot continues"
  fi
else
  echo "[setup] CHAT_COMPARE_PROVISION not set — skipping SigLIP model + embedding ingest (non-chat shard)"
fi

echo "[setup] starting SearXNG stub…"
node "$SCRIPT_DIR/maestro-searxng-stub.mjs" > /tmp/searxng-stub.log 2>&1 &

echo "[setup] starting backend API…"
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" PGDATABASE="$PGDATABASE" \
  PORT=3000 \
  SEARXNG_INSTANCES=http://127.0.0.1:8890 \
  KNOWLEDGE_ROUTER_KB_TIMEOUT_MS=1 WEBSEARCH_FALLBACK_THRESHOLD=2 \
  JWT_ACCESS_SECRET=phase2-e2e-access JWT_REFRESH_SECRET=phase2-e2e-refresh \
  CORS_ORIGINS=http://localhost:8081 \
  pnpm dev > /tmp/backend.log 2>&1 &

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
