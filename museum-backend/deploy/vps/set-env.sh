#!/usr/bin/env bash
set -euo pipefail

MUSAIUM_DIR="${MUSAIUM_DIR:-/srv/museum}"
ENV_FILE="${MUSAIUM_DIR}/.env"
BACKUP_DIR="${MUSAIUM_DIR}/env-backups"
ENV_GROUP="${ENV_GROUP:-docker}"

if [ "$#" -ne 2 ] || ! printf '%s' "$1" | grep -Eq '^[A-Z][A-Z0-9_]*$'; then
  echo "usage : set-env.sh CLE VALEUR" >&2
  exit 64
fi
KEY="$1"
VALUE="$2"
case "$VALUE" in
  *$'\n'* | *$'\r'*)
    echo "set-env.sh : ${KEY} refusé : valeur sur plusieurs lignes" >&2
    exit 65
    ;;
esac

LOCK="${ENV_FILE}.lock"
TRIES="${SET_ENV_LOCK_TRIES:-300}"
until mkdir "$LOCK" 2>/dev/null; do
  TRIES=$((TRIES - 1))
  if [ "$TRIES" -le 0 ]; then
    echo "set-env.sh : ${KEY} refusé : ${LOCK} reste tenu ; le supprimer si aucune écriture n'est en cours" >&2
    exit 75
  fi
  sleep 0.1
done
TMP=""
trap 'rm -f "$TMP"; rmdir "$LOCK"' EXIT

umask 077
mkdir -p "$BACKUP_DIR"
chmod 0700 "$BACKUP_DIR"
find "$BACKUP_DIR" -type f -name '.env.*' -mtime +30 -delete
BACKUP="$(mktemp "${BACKUP_DIR}/.env.$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")"
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$BACKUP"
fi

TMP="$(mktemp "${ENV_FILE}.XXXXXX")"
{
  grep -v "^${KEY}=" "$ENV_FILE" 2>/dev/null || true
  printf '%s=%s\n' "$KEY" "$VALUE"
} > "$TMP"
chgrp "$ENV_GROUP" "$TMP"
chmod 0640 "$TMP"
mv "$TMP" "$ENV_FILE"
TMP=""

printf '%s\n' "$BACKUP"
