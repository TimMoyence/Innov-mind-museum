#!/usr/bin/env bash
# =============================================================================
# Sentinel: dev-container-env-drift
# =============================================================================
# Detects the recurring "container env stale vs current .env" failure mode :
#
#   1. Dev edits museum-backend/.env (changes NODE_ENV / DB_URL / REDIS_PASSWORD)
#   2. Dev does NOT `docker compose up -d --force-recreate` afterwards.
#   3. The running container keeps the old env vars from its original start.
#   4. Hours later, the dev sees weird symptoms (auth warnings, wrong DB,
#      production-mode CORS errors) and spends 30+ min debugging.
#
# Seen 2026-05-17 → 2026-05-18 (TD-44 audit). The dev-backend container had
# `NODE_ENV=production` + `REDIS_PASSWORD=hash64` from its 08:01 start, while
# the .env on disk had been edited at 23:01 same day to remove those.
#
# This script:
#   - Reads `museum-backend/.env` (KEY=value lines, ignoring comments).
#   - Runs `docker exec dev-backend printenv KEY` for a focused allow-list
#     of vars (the ones whose drift causes visible breakage).
#   - Reports any disagreement to stderr.
#   - Exit 0 = no drift. Exit 1 = drift detected.
#
# Tolerates `dev-backend` not running (exit 0, warn) — this script is for
# the "live dev stack" health check, not a strict CI gate.
#
# Intentionally a shell script (vs another .mjs sentinel) because it MUST
# call `docker exec` and is most natural in bash. Other sentinels in this
# directory are pure Node — that's because they read repo files only.
#
# Integration: invoked by scripts/morning-check.sh. Can also be run
# standalone: `bash scripts/sentinels/dev-container-env-drift.sh`.
# =============================================================================
set -euo pipefail

CONTAINER="${DEV_CONTAINER_NAME:-dev-backend}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/museum-backend/.env"

# Vars whose drift causes user-visible breakage AND that are .env-controlled
# (not overridden by `environment:` block in docker-compose.dev.yml).
#
# Excluded by design (compose overrides them in dev):
#   - REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_URL : injected via
#     `backend.environment:` so the container can resolve `redis:6379`
#     (compose service name) regardless of what's in .env.
#   - DB_HOST / DB_PORT : `db:5432` inside the docker network, while .env
#     uses `localhost:5433` for host-run backend (npm run dev sans Docker).
#
# Add a var here when it's read by env.ts at module load AND a stale value
# in the running container would cause confusing behavior.
WATCHED_VARS=(
  NODE_ENV
  PGDATABASE
  DB_USER
  JWT_ACCESS_SECRET
  OPENAI_API_KEY
)

# Pretty
if [ -t 1 ]; then
  C_RED=$'\033[31m'
  C_YEL=$'\033[33m'
  C_GRE=$'\033[32m'
  C_DIM=$'\033[2m'
  C_END=$'\033[0m'
else
  C_RED=''
  C_YEL=''
  C_GRE=''
  C_DIM=''
  C_END=''
fi

# Bail-out: container not running.
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "${C_YEL}[sentinel:dev-container-env-drift] WARN${C_END}: container '$CONTAINER' not running — nothing to check."
  exit 0
fi

# Bail-out: .env missing.
if [ ! -f "$ENV_FILE" ]; then
  echo "${C_YEL}[sentinel:dev-container-env-drift] WARN${C_END}: $ENV_FILE not found — skipping (run from repo root with .env present)."
  exit 0
fi

# Parse .env into associative entries. Tolerant of comments and blank lines.
declare -A ENV_FILE_VALS=()
while IFS= read -r line || [ -n "$line" ]; do
  # strip comments + whitespace
  line="${line%%#*}"
  line="${line## }"
  line="${line%% }"
  [ -z "$line" ] && continue
  # KEY=VALUE pattern
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    # strip surrounding quotes
    val="${val%\"}"
    val="${val#\"}"
    val="${val%\'}"
    val="${val#\'}"
    ENV_FILE_VALS["$key"]="$val"
  fi
done < "$ENV_FILE"

# ── Coarse signal: .env modified AFTER container start? ──────────────────────
# This catches the most common drift cause (user edited .env then forgot to
# `docker compose up -d --force-recreate`) even when no watched var disagrees.
ENV_MTIME_EPOCH="$(stat -f "%m" "$ENV_FILE" 2>/dev/null || stat -c "%Y" "$ENV_FILE" 2>/dev/null || echo 0)"
CONTAINER_START_ISO="$(docker inspect "$CONTAINER" --format '{{.State.StartedAt}}' 2>/dev/null || true)"
if [ -n "$CONTAINER_START_ISO" ]; then
  # `date -d` is GNU ; macOS uses `date -j -f`. Try both.
  # Docker's `.State.StartedAt` is ISO 8601 UTC (suffix `Z` or fractional sec).
  # On GNU `date -d` recognizes the timezone. On macOS `date -j -f` doesn't,
  # so we force UTC via `TZ=UTC` to keep the comparison aligned with stat's
  # UTC epoch mtime. Bug seen 2026-05-18 (false MTIME-DRIFT after recreate).
  CONTAINER_START_EPOCH="$(date -d "$CONTAINER_START_ISO" +%s 2>/dev/null || TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "${CONTAINER_START_ISO%%.*}" +%s 2>/dev/null || echo 0)"
else
  CONTAINER_START_EPOCH=0
fi

ENV_NEWER_THAN_CONTAINER=0
if [ "$ENV_MTIME_EPOCH" -gt 0 ] && [ "$CONTAINER_START_EPOCH" -gt 0 ] && [ "$ENV_MTIME_EPOCH" -gt "$CONTAINER_START_EPOCH" ]; then
  ENV_NEWER_THAN_CONTAINER=1
  AGE_HOURS=$(( (ENV_MTIME_EPOCH - CONTAINER_START_EPOCH) / 3600 ))
  echo "${C_YEL}MTIME-DRIFT${C_END} : .env was modified ~${AGE_HOURS}h AFTER container started"
  echo "  ${C_DIM}.env mtime:${C_END}     $(date -r "$ENV_MTIME_EPOCH" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "$ENV_MTIME_EPOCH")"
  echo "  ${C_DIM}container start:${C_END} $CONTAINER_START_ISO"
fi

drift_count=0
checked_count=0

for var in "${WATCHED_VARS[@]}"; do
  # Container value (empty string if unset). `printenv` exits non-zero on
  # missing vars — handle with `|| echo ""`.
  container_val="$(docker exec "$CONTAINER" printenv "$var" 2>/dev/null || true)"

  # .env value
  env_val="${ENV_FILE_VALS[$var]:-}"

  # Skip if both are empty.
  if [ -z "$container_val" ] && [ -z "$env_val" ]; then
    continue
  fi

  checked_count=$((checked_count + 1))

  if [ "$container_val" != "$env_val" ]; then
    drift_count=$((drift_count + 1))
    # Redact any var that looks secret-bearing — show first 4 chars + length.
    if [[ "$var" == *PASSWORD* || "$var" == *SECRET* || "$var" == *KEY* || "$var" == *TOKEN* ]]; then
      cv_redacted="$(printf '%s' "$container_val" | cut -c1-4)***[${#container_val}c]"
      ev_redacted="$(printf '%s' "$env_val" | cut -c1-4)***[${#env_val}c]"
      echo "${C_RED}DRIFT${C_END} $var :"
      echo "  ${C_DIM}container:${C_END} $cv_redacted"
      echo "  ${C_DIM}.env file:${C_END} $ev_redacted"
    else
      echo "${C_RED}DRIFT${C_END} $var :"
      echo "  ${C_DIM}container:${C_END} ${container_val:-<unset>}"
      echo "  ${C_DIM}.env file:${C_END} ${env_val:-<unset>}"
    fi
  fi
done

echo ""
if [ "$drift_count" -gt 0 ] || [ "$ENV_NEWER_THAN_CONTAINER" -eq 1 ]; then
  if [ "$drift_count" -gt 0 ]; then
    echo "${C_RED}[sentinel:dev-container-env-drift] FAIL${C_END} — $drift_count drift(s) across $checked_count watched vars."
  else
    echo "${C_YEL}[sentinel:dev-container-env-drift] WARN${C_END} — .env modified after container start ; no watched-var drift visible (yet)."
  fi
  echo ""
  echo "  How to fix:"
  echo "  - The container's env is captured at \`docker run\` time. Editing .env later does NOT update it."
  echo "  - To sync: ${C_GRE}cd museum-backend && docker compose -f docker-compose.dev.yml up -d --force-recreate backend${C_END}"
  echo "  - To diverge intentionally (e.g. you want NODE_ENV=production in container while .env says development), document it in museum-frontend/RUN_LOCAL.md § \"NODE_ENV intentional override\"."
  echo ""
  exit 1
fi

echo "${C_GRE}[sentinel:dev-container-env-drift] PASS${C_END} — $checked_count vars checked, 0 drift."
exit 0
