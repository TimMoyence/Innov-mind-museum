#!/usr/bin/env bash
#
# Auto-rollback script invoked by the CI deploy workflow on smoke-test failure.
#
# Reverses both the container image AND any migrations applied during the
# failing deploy. Called with:
#   rollback.sh <compose-file> <service-name> <image-ref>
#
# State directory /srv/museum/.rollback/<service> holds:
#   - applied-count.txt      # number of migrations newly applied by this deploy
#   - previous-image.txt     # fully-qualified image ref tagged :previous before pull
#
# Exit codes:
#   0  rollback succeeded
#   42 migration revert failed
#   43 image retag / restart failed
#   44 post-rollback healthcheck failed
#
set -u
# NOTE: do NOT use `set -e` here — we want to capture partial failures and
# report a precise exit code so the CI workflow can surface the right runbook link.

COMPOSE_FILE="${1:?compose file path required}"
SERVICE="${2:?service name required}"
IMAGE_REF="${3:?image ref required (e.g. ghcr.io/org/museum-backend)}"

STATE_DIR="${HOME}/.museum-rollback/${SERVICE}"
PRE_FILE="${STATE_DIR}/pre-count.txt"
APPLIED_FILE="${STATE_DIR}/applied-count.txt"

if [ ! -d "${STATE_DIR}" ]; then
  echo "[rollback] no state directory at ${STATE_DIR} — nothing to roll back"
  exit 0
fi

# Source of truth = the migrations table itself.
# Read pre-count.txt (baseline written before migration:run) and query
# the DB right now for the current count, then revert the delta. This is
# resilient to a stale or missing applied-count.txt (e.g., deploy crashed
# between migration:run and the file write) which previously made rollback
# silently revert 0 migrations.
APPLIED_COUNT=0
PRE_COUNT=""
CURRENT_COUNT=""

if [ -f "${PRE_FILE}" ]; then
  PRE_COUNT="$(cat "${PRE_FILE}" | tr -d '[:space:]')"
fi

CURRENT_COUNT="$(docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" \
  node scripts/count-applied-migrations.cjs 2>/dev/null | tr -d '[:space:]' || true)"

if [ -n "${PRE_COUNT}" ] && [ -n "${CURRENT_COUNT}" ] \
   && printf '%s' "${PRE_COUNT}" | grep -qE '^[0-9]+$' \
   && printf '%s' "${CURRENT_COUNT}" | grep -qE '^[0-9]+$'; then
  DELTA="$(( CURRENT_COUNT - PRE_COUNT ))"
  if [ "${DELTA}" -lt 0 ]; then DELTA=0; fi
  APPLIED_COUNT="${DELTA}"
  echo "[rollback] db-derived count: pre=${PRE_COUNT} current=${CURRENT_COUNT} → revert ${APPLIED_COUNT}"
elif [ -f "${APPLIED_FILE}" ]; then
  # Fallback: trust the file written by CI after migration:run.
  APPLIED_COUNT="$(cat "${APPLIED_FILE}" | tr -d '[:space:]')"
  APPLIED_COUNT="${APPLIED_COUNT:-0}"
  echo "[rollback] db-query failed; falling back to applied-count.txt = ${APPLIED_COUNT}"
else
  echo "[rollback] no pre-count + db-query unavailable + no applied-count.txt — assuming 0 migrations to revert (code-only rollback)"
fi

echo "[rollback] starting for service=${SERVICE} (applied migrations this deploy: ${APPLIED_COUNT})"

# ─── 1. Revert migrations (newest first) ────────────────────────────────────
if [ "${APPLIED_COUNT}" -gt 0 ]; then
  echo "[rollback] reverting ${APPLIED_COUNT} migration(s)"
  i=0
  while [ "${i}" -lt "${APPLIED_COUNT}" ]; do
    docker compose -f "${COMPOSE_FILE}" run --rm --no-deps -T "${SERVICE}" \
      node ./node_modules/typeorm/cli.js migration:revert -d dist/src/data/db/data-source.js
    rc=$?
    if [ "${rc}" -ne 0 ]; then
      echo "[rollback] FATAL — migration:revert failed at step $((i + 1))/${APPLIED_COUNT}"
      echo "[rollback] database is in an intermediate state — escalate to ops runbook docs/RUNBOOKS/auto-rollback.md"
      exit 42
    fi
    i=$((i + 1))
  done
else
  echo "[rollback] no new migrations to revert (code-only rollback)"
fi

# ─── 2. Retag :previous → :latest and restart the service ──────────────────
echo "[rollback] retagging ${IMAGE_REF}:previous → ${IMAGE_REF}:latest"
docker tag "${IMAGE_REF}:previous" "${IMAGE_REF}:latest"
rc=$?
if [ "${rc}" -ne 0 ]; then
  echo "[rollback] FATAL — could not retag :previous (image missing?)"
  exit 43
fi

echo "[rollback] recreating ${SERVICE}"
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate --no-deps --timeout 30 "${SERVICE}"
rc=$?
if [ "${rc}" -ne 0 ]; then
  echo "[rollback] FATAL — docker compose up failed"
  exit 43
fi

# ─── 3. Healthcheck loop against the rolled-back container ─────────────────
echo "[rollback] waiting for ${SERVICE} healthcheck..."
TRIES=0
MAX_TRIES=20
until docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" \
  node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" 2>/dev/null
do
  TRIES=$((TRIES + 1))
  if [ "${TRIES}" -ge "${MAX_TRIES}" ]; then
    echo "[rollback] FATAL — rolled-back container failed healthcheck after ${MAX_TRIES} attempts"
    exit 44
  fi
  echo "  attempt ${TRIES}/${MAX_TRIES}..."
  sleep 3
done

echo "[rollback] ${SERVICE} rolled back successfully — code + migrations restored"
# Clear state so a subsequent successful deploy starts clean.
rm -f "${APPLIED_FILE}" "${PRE_FILE}"
exit 0
