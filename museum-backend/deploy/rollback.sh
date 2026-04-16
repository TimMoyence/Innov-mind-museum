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
APPLIED_FILE="${STATE_DIR}/applied-count.txt"

if [ ! -d "${STATE_DIR}" ]; then
  echo "[rollback] no state directory at ${STATE_DIR} — nothing to roll back"
  exit 0
fi

APPLIED_COUNT=0
if [ -f "${APPLIED_FILE}" ]; then
  APPLIED_COUNT="$(cat "${APPLIED_FILE}" | tr -d '[:space:]')"
  APPLIED_COUNT="${APPLIED_COUNT:-0}"
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

echo "[rollback] ✅ ${SERVICE} rolled back successfully — code + migrations restored"
# Clear the state file so a subsequent successful deploy starts clean.
rm -f "${APPLIED_FILE}"
exit 0
