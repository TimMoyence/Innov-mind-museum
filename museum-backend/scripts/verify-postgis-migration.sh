#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${POSTGIS_VERIFY_CONTAINER:-museum-postgis-verify}"
HOST_PORT="${POSTGIS_VERIFY_PORT:-5544}"
DB_NAME="${POSTGIS_VERIFY_DB:-museum_pg_verify}"
DB_USER="${POSTGIS_VERIFY_USER:-museum}"
DB_PASS="${POSTGIS_VERIFY_PASS:-museum}"
IMAGE="${POSTGIS_VERIFY_IMAGE:-postgis/postgis:16-3.5}"
PLATFORM="${POSTGIS_VERIFY_PLATFORM:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

cleanup() {
  local code=$?
  echo "--- teardown ---"
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  exit $code
}
trap cleanup EXIT INT TERM

echo "--- starting $IMAGE on host port $HOST_PORT ${PLATFORM:+(platform=$PLATFORM)}---"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER_NAME" \
  ${PLATFORM:+--platform="$PLATFORM"} \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -p "$HOST_PORT:5432" \
  "$IMAGE" >/dev/null

echo "--- waiting for postgres ready ---"
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME"

echo "--- installing postgresql-16-pgvector ---"
docker exec "$CONTAINER_NAME" sh -c 'apt-get update -qq && apt-get install -y -qq postgresql-16-pgvector' >/dev/null

export DB_HOST=localhost
export DB_PORT="$HOST_PORT"
export PGDATABASE="$DB_NAME"
export DB_USER="$DB_USER"
export DB_PASSWORD="$DB_PASS"
export DB_SYNCHRONIZE=false
export NODE_ENV=test

echo "--- pnpm migration:run ---"
pnpm migration:run

echo "--- asserting PostGIS branch was selected ---"
ACTUAL_TYPE=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -tA -c \
  "SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='museums' AND column_name='geofence'")
if [[ "$ACTUAL_TYPE" != "geometry" ]]; then
  echo "FAIL: expected museums.geofence to be type 'geometry', got '${ACTUAL_TYPE:-<absent>}'"
  echo "(JSONB fallback branch was selected — postgis extension likely failed to load)"
  exit 2
fi
echo "OK: museums.geofence column exists with type 'geometry'"

JSONB_PRESENT=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -tA -c \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='museums' AND column_name='geofence_bbox'")
if [[ "$JSONB_PRESENT" != "0" ]]; then
  echo "WARN: museums.geofence_bbox column also present — both branches were created (should be one or the other)"
fi

GIST_PRESENT=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -tA -c \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='museums' AND indexname='IDX_museums_geofence_gist'")
if [[ "$GIST_PRESENT" != "1" ]]; then
  echo "FAIL: GIST index IDX_museums_geofence_gist not created"
  exit 2
fi
echo "OK: GIST index IDX_museums_geofence_gist present"

echo "--- pnpm migration:revert (revert the 4 W3 migrations in reverse order) ---"
for i in 1 2 3 4; do
  pnpm migration:revert
done

echo "--- verifying schema is clean after revert ---"
REMAINING=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -tA -c \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='museums' AND column_name IN ('geofence','geofence_bbox')")
if [[ "$REMAINING" != "0" ]]; then
  echo "FAIL: geofence column(s) still present after revert ($REMAINING)"
  exit 2
fi
echo "OK: geofence columns dropped on revert"

echo ""
echo "============================================================"
echo "PostGIS branch verified end-to-end."
echo "============================================================"
