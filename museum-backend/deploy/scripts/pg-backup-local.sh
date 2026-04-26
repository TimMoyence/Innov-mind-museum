#!/usr/bin/env bash
# Local dev only — production runs via GHA (.github/workflows/db-backup-daily.yml).
#
# Convenience script that mirrors the GHA pipeline so an operator can validate
# pg_dump | gpg pipeline + S3 upload from their workstation BEFORE relying on
# the scheduled workflow. Useful for:
#   - Verifying the GPG public key recipient is set up correctly.
#   - Smoke-testing S3 credentials against the existing media bucket.
#   - Generating an ad-hoc backup before a risky migration.
#
# Required environment variables:
#   DATABASE_URL_RO         postgres://user:pwd@host:port/db   (read-only role recommended)
#   BACKUP_GPG_RECIPIENT    GPG key ID or email of recipient
#   S3_BUCKET               existing media bucket (reused; prefix backups/daily/)
#   S3_ENDPOINT             https://s3.<region>.scw.cloud (or AWS endpoint)
#   S3_REGION               e.g. fr-par
#   S3_ACCESS_KEY_ID        S3 access key
#   S3_SECRET_ACCESS_KEY    S3 secret key
# Optional:
#   BACKUP_PREFIX           default: backups/daily
#   BACKUP_TAG              default: $(date -u +%Y-%m-%d)
#   BACKUP_HEARTBEAT_URL    if set, ping on success
set -euo pipefail

: "${DATABASE_URL_RO:?DATABASE_URL_RO is required}"
: "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_ENDPOINT:?S3_ENDPOINT is required}"
: "${S3_REGION:?S3_REGION is required}"
: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY is required}"

BACKUP_PREFIX="${BACKUP_PREFIX:-backups/daily}"
BACKUP_TAG="${BACKUP_TAG:-$(date -u +%Y-%m-%d)}"
BACKUP_KEY="${BACKUP_PREFIX}/${BACKUP_TAG}.pgdump.gpg"

command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump not found in PATH"; exit 1; }
command -v gpg     >/dev/null 2>&1 || { echo "gpg not found in PATH"; exit 1; }
command -v s5cmd   >/dev/null 2>&1 || { echo "s5cmd not found in PATH (https://github.com/peak/s5cmd)"; exit 1; }

echo "[pg-backup-local] target s3://${S3_BUCKET}/${BACKUP_KEY}"
echo "[pg-backup-local] recipient ${BACKUP_GPG_RECIPIENT}"

export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}"
export AWS_REGION="${S3_REGION}"
export AWS_ENDPOINT_URL="${S3_ENDPOINT}"

set -o pipefail
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --compress=9 \
  "${DATABASE_URL_RO}" \
| gpg --batch --yes --trust-model always \
      --encrypt --recipient "${BACKUP_GPG_RECIPIENT}" \
| s5cmd --endpoint-url "${AWS_ENDPOINT_URL}" \
      pipe "s3://${S3_BUCKET}/${BACKUP_KEY}"

echo "[pg-backup-local] upload OK"

if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
  curl -fsS --max-time 10 "${BACKUP_HEARTBEAT_URL}" >/dev/null \
    && echo "[pg-backup-local] heartbeat OK" \
    || echo "[pg-backup-local] heartbeat ping failed (non-fatal)"
fi
