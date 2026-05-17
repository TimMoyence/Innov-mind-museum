#!/usr/bin/env bash
# scripts/dev-migration-check.sh
#
# Compares museum-backend/src/data/db/migrations/*.ts (source of truth)
# vs the applied migrations recorded in the local Docker Postgres
# `migrations` table. Flags pending migrations BEFORE the developer
# wastes 30 min wondering why /api/auth/login returns "column User.tier
# does not exist" 500s.
#
# Exit codes:
#   0 = DB in sync
#   1 = pending migrations exist (printable list + suggested command)
#   2 = setup failure (Docker down, container missing, DB unreachable)
#
# Generated 2026-05-17 after a real incident where AddUserTier1778900000000
# was missing on the local DB while the codebase relied on the column.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BE="$ROOT/museum-backend"
MIG_DIR="$BE/src/data/db/migrations"
DB_CONTAINER="dev-postgres"
DB_USER="postgres"
DB_NAME="museumAI"

if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_GREEN=$'\033[32m'
  C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=; C_YELLOW=; C_GREEN=; C_BOLD=; C_RESET=
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "${C_RED}✗ docker CLI not found${C_RESET}" >&2
  exit 2
fi

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${DB_CONTAINER}$"; then
  echo "${C_RED}✗ Container '${DB_CONTAINER}' is not running.${C_RESET}" >&2
  echo "  Fix: docker compose -f ${BE}/docker-compose.dev.yml up -d" >&2
  exit 2
fi

if [ ! -d "$MIG_DIR" ]; then
  echo "${C_RED}✗ Migrations dir not found: $MIG_DIR${C_RESET}" >&2
  exit 2
fi

# Source migration class names — derived from filenames stripped of .ts extension.
# Pattern: <timestamp>-<ClassName>.ts → ClassName<timestamp>
LOCAL_NAMES=$(
  for f in "$MIG_DIR"/*.ts; do
    base=$(basename "$f" .ts)
    ts="${base%%-*}"
    cls="${base#*-}"
    echo "${cls}${ts}"
  done | sort
)

# Applied migrations from DB.
APPLIED_NAMES=$(
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -A -t \
    -c "SELECT name FROM migrations ORDER BY name" 2>/dev/null | sort
) || {
  echo "${C_RED}✗ Cannot query 'migrations' table on $DB_NAME.${C_RESET}" >&2
  echo "  Probable causes: DB just spun up (no schema yet), wrong DB name, container unhealthy." >&2
  exit 2
}

PENDING=$(comm -23 <(printf '%s\n' "$LOCAL_NAMES") <(printf '%s\n' "$APPLIED_NAMES") || true)

if [ -z "$PENDING" ]; then
  COUNT=$(printf '%s\n' "$LOCAL_NAMES" | wc -l | tr -d ' ')
  echo "${C_GREEN}✓ DB schema in sync ($COUNT migrations applied)${C_RESET}"
  exit 0
fi

PENDING_COUNT=$(printf '%s\n' "$PENDING" | wc -l | tr -d ' ')
echo ""
echo "${C_YELLOW}${C_BOLD}⚠ ${PENDING_COUNT} pending migration(s):${C_RESET}"
printf '%s\n' "$PENDING" | sed 's/^/    - /'
echo ""
echo "Apply now:"
echo "    ${C_BOLD}docker exec ${DB_CONTAINER%-postgres}-backend pnpm migration:run${C_RESET}"
echo ""
exit 1
