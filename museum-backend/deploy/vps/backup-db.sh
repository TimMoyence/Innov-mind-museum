#!/usr/bin/env bash
set -euo pipefail

MUSAIUM_DIR="${MUSAIUM_DIR:-/srv/museum}"
. "${MUSAIUM_DIR}/backup.env"
S3_ENV_FILE="${MUSAIUM_DIR}/.env"
. "$(dirname "$0")/s3-env.sh"

encrypted="$(mktemp)"
trap 'rm -f "${encrypted}"' EXIT
trap 'curl -fsS --max-time 10 -X POST "${BACKUP_HEARTBEAT_URL}/fail" || true' ERR

cd "${MUSAIUM_DIR}"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" --format=custom --no-owner --no-acl --compress=9 "$POSTGRES_DB"' \
  | gpg --batch --yes --trust-model always --encrypt --recipient "${BACKUP_GPG_RECIPIENT}" --output "${encrypted}"

s5cmd --endpoint-url "${S3_ENDPOINT}" cp "${encrypted}" "s3://${S3_BUCKET}/backups/daily/$(date -u +%Y-%m-%d).pgdump.gpg"

curl -fsS --max-time 10 "${BACKUP_HEARTBEAT_URL}"
