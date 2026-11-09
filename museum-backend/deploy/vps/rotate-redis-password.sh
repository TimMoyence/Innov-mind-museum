#!/usr/bin/env bash
set -euo pipefail

MUSAIUM_DIR="${MUSAIUM_DIR:-/srv/museum}"
ENV_FILE="${MUSAIUM_DIR}/.env"
SET_ENV="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/set-env.sh"
NOAUTH_WAIT_SECONDS="${NOAUTH_WAIT_SECONDS:-30}"
URL_WITH_PASSWORD='^(rediss?://[^:@/]*):[^@]*@(.*)$'

compose() {
  docker compose --project-directory "$MUSAIUM_DIR" "$@"
}

setting() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

restart() {
  compose up -d --no-deps --force-recreate --wait --wait-timeout 120 redis
  compose up -d --no-deps --force-recreate --wait --wait-timeout 180 backend
}

OLD_PASSWORD="$(setting REDIS_PASSWORD)"
OLD_URL="$(setting REDIS_URL)"

restore() {
  bash "$SET_ENV" REDIS_PASSWORD "$OLD_PASSWORD" >/dev/null
  if [[ "$OLD_URL" =~ $URL_WITH_PASSWORD ]]; then
    bash "$SET_ENV" REDIS_URL "$OLD_URL" >/dev/null
  fi
}

fail() {
  echo "rotate-redis-password : rotation annulée : $1 ; l'ancien mot de passe est remis" >&2
  restore
  restart || echo "rotate-redis-password : le redémarrage sur l'ancien mot de passe a aussi échoué" >&2
  exit 1
}

NEW_PASSWORD="$(openssl rand -hex 24)"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

bash "$SET_ENV" REDIS_PASSWORD "$NEW_PASSWORD" >/dev/null
if [[ "$OLD_URL" =~ $URL_WITH_PASSWORD ]]; then
  bash "$SET_ENV" REDIS_URL "${BASH_REMATCH[1]}:${NEW_PASSWORD}@${BASH_REMATCH[2]}" >/dev/null
fi

restart || fail "redis ou le backend ne redémarre pas sain"

PING="$(REDISCLI_AUTH="$NEW_PASSWORD" compose exec -T -e REDISCLI_AUTH redis redis-cli --no-auth-warning PING 2>&1)" ||
  fail "Redis refuse le nouveau mot de passe"
[ "$PING" = "PONG" ] || fail "Redis refuse le nouveau mot de passe"

sleep "$NOAUTH_WAIT_SECONDS"
BACKEND_LOGS="$(compose logs --since "$STARTED" backend 2>&1)"
if printf '%s' "$BACKEND_LOGS" | grep -Eq 'NOAUTH|WRONGPASS'; then
  fail "le backend ne s'authentifie pas auprès de Redis"
fi

echo "rotate-redis-password : nouveau mot de passe en place, redis et backend sains"
