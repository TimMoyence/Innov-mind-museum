#!/usr/bin/env bash
# Phase 2 — Maestro runner setup.
# Boots a Postgres instance (via docker-compose by default, or native if
# SKIP_DOCKER_COMPOSE=1 — used in CI on macos-latest where Colima/VZ can't
# spin a nested VM) and the BE API, then waits for /api/health.
#
# Env overrides (CI E37bis):
#   SKIP_DOCKER_COMPOSE=1 — caller pre-provisioned Postgres natively
#   DB_PORT (default 5433 for compose, 5432 for native)
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

# Install backend deps + run migrations (Phase 2 requires real schema for flows that hit /api/auth/register)
echo "[setup] installing backend deps…"
corepack enable
pnpm install --frozen-lockfile

echo "[setup] running migrations…"
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" PGDATABASE="$PGDATABASE" \
  pnpm migration:run

# Seed the demo museums (idempotent upsert ON CONFLICT slug). ROOT CAUSE of the
# "Maestro full never green" history: museums were never seeded in CI, so every
# museum-shard / picker flow ran against an empty `museums` table. This single
# site covers ALL three Maestro boot paths (Android shard matrix, netshape
# nightly, iOS nightly) since each calls this script — no per-job inline seed.
echo "[setup] seeding demo museums…"
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" PGDATABASE="$PGDATABASE" \
  pnpm seed:museums

# ──────────────────────────────────────────────────────────────────────────────
# Visual-similarity (/chat/compare) provisioning — REQUIRED for the chat-compare
# Maestro flow to reach a REAL match. Without these two steps the carousel
# renders header-only (empty-state) and the strengthened Phase-5 per-card assert
# in .maestro/chat-compare.yaml fails RED — which is the intended contract: a
# dead encoder or empty catalog MUST fail the nightly end-to-end, not pass
# vacuously on the header text that renders in both the empty and populated
# branches of ImageCompareCarousel.tsx.
#
# Step A: pull the SigLIP-2 ONNX encoder into museum-backend/models/ (default
#   path ./models/siglip2-base-patch16-224.onnx, matching env.ts
#   visualSimilarity.siglipOnnxModelPath). Without it every /chat/compare returns
#   HTTP 503 encoder_unavailable. Requires docker logged in to ghcr.io for the
#   pinned base image; gated on CHAT_COMPARE_PROVISION=1 so non-chat shards
#   (which do not need the ~354MB model) skip the pull.
# Step B: ingest ≥1 public-domain artwork embedding for a seeded museum
#   (Musée d'Aquitaine, wikidata_qid Q3329534 — present in seed-museums.ts,
#   backfilled onto museums.wikidata_qid above) so a real CompareMatch card is
#   reachable. catalog:ingest resolves --museum=<Qid> against museums.wikidata_qid
#   (catalog-ingest.ts), so seed:museums MUST run first (it does, above).
# Both steps run under `set -e`: if the model can't be pulled or the catalog
# stays empty the setup fails loudly here rather than emitting a misleading RED
# in the flow itself.
# ──────────────────────────────────────────────────────────────────────────────
if [ "${CHAT_COMPARE_PROVISION:-}" = "1" ]; then
  echo "[setup] CHAT_COMPARE_PROVISION=1 — pulling SigLIP encoder model…"
  bash scripts/pull-siglip-model.sh

  echo "[setup] ingesting at least one public-domain artwork embedding (Q3329534)…"
  DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" PGDATABASE="$PGDATABASE" \
    EMBEDDINGS_PROVIDER=siglip-onnx \
    pnpm catalog:ingest -- --museum=Q3329534 --license-filter=public-domain,cc-0
else
  echo "[setup] CHAT_COMPARE_PROVISION not set — skipping SigLIP model + embedding ingest (non-chat shard)"
fi

# Start the backend API in the background, log to /tmp/backend.log
echo "[setup] starting backend API…"
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" PGDATABASE="$PGDATABASE" \
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
