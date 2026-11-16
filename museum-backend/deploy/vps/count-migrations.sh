#!/usr/bin/env bash
set -uo pipefail

cd "${MUSAIUM_DIR:-/srv/museum}" || exit 1

query() {
  docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"' sh "$1"
}

fail() {
  echo "[count-migrations] impossible de lire la table migrations" >&2
  exit 1
}

table="$(query "SELECT to_regclass('migrations') IS NOT NULL")" || fail
case "${table}" in
  f) count=0 ;;
  t) count="$(query 'SELECT count(*) FROM migrations')" || fail ;;
  *) fail ;;
esac
[[ "${count}" =~ ^[0-9]+$ ]] || fail
printf '%s\n' "${count}"
