#!/usr/bin/env bash
set -u

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
  APPLIED_COUNT="$(cat "${APPLIED_FILE}" | tr -d '[:space:]')"
  APPLIED_COUNT="${APPLIED_COUNT:-0}"
  echo "[rollback] db-query failed; falling back to applied-count.txt = ${APPLIED_COUNT}"
else
  echo "[rollback] no pre-count + db-query unavailable + no applied-count.txt — assuming 0 migrations to revert (code-only rollback)"
fi

echo "[rollback] starting for service=${SERVICE} (applied migrations this deploy: ${APPLIED_COUNT})"

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

PREV_TAG_FILE="${STATE_DIR}/previous-image-tag.txt"
PREV_TAG=""
if [ -f "${PREV_TAG_FILE}" ]; then
  PREV_TAG="$(cat "${PREV_TAG_FILE}" | tr -d '[:space:]')"
fi
if [ -z "${PREV_TAG}" ]; then
  echo "[rollback] FATAL — no previous IMAGE_TAG captured (previous-image-tag.txt missing/empty); cannot roll code back"
  exit 43
fi

echo "[rollback] restoring IMAGE_TAG=${PREV_TAG} in /srv/museum/.env"
sudo /srv/museum/vps/set-env.sh IMAGE_TAG "${PREV_TAG}" >/dev/null

echo "[rollback] recreating ${SERVICE} on ${PREV_TAG}"
export IMAGE_TAG="${PREV_TAG}"
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate --no-deps --timeout 30 "${SERVICE}"
rc=$?
if [ "${rc}" -ne 0 ]; then
  echo "[rollback] FATAL — docker compose up failed"
  exit 43
fi

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
rm -f "${APPLIED_FILE}" "${PRE_FILE}"
exit 0
