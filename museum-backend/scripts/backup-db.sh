#!/usr/bin/env bash
set -euo pipefail

# ── Configuration (all via environment variables) ────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/srv/museum/backups}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${PGDATABASE:-museumia_prod}"
DB_USER="${BACKUP_DB_USER:-museumia_backup}"
RETENTION_DAILY="${RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${RETENTION_WEEKLY:-4}"

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
FILENAME="musaium-backup-${TIMESTAMP}.dump"

# ── Ensure directories exist ─────────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/weekly"

# ── Run pg_dump ──────────────────────────────────────────────────────────────
echo "[$(date -Iseconds)] Starting backup: ${FILENAME}"

PGPASSWORD="${BACKUP_DB_PASSWORD}" pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --file="${BACKUP_DIR}/daily/${FILENAME}"

# Cross-platform file size
if stat --version >/dev/null 2>&1; then
  BACKUP_SIZE=$(stat -c%s "${BACKUP_DIR}/daily/${FILENAME}")
else
  BACKUP_SIZE=$(stat -f%z "${BACKUP_DIR}/daily/${FILENAME}")
fi
echo "[$(date -Iseconds)] Backup complete: ${FILENAME} (${BACKUP_SIZE} bytes)"

# ── Weekly copy (Sunday) ─────────────────────────────────────────────────────
if [ "${DAY_OF_WEEK}" = "7" ]; then
  cp "${BACKUP_DIR}/daily/${FILENAME}" "${BACKUP_DIR}/weekly/${FILENAME}"
  echo "[$(date -Iseconds)] Weekly backup saved"
fi

# ── Retention: remove old daily backups ──────────────────────────────────────
DAILY_COUNT=$(ls -1 "${BACKUP_DIR}/daily"/musaium-backup-*.dump 2>/dev/null | wc -l)
if [ "${DAILY_COUNT}" -gt "${RETENTION_DAILY}" ]; then
  ls -1t "${BACKUP_DIR}/daily"/musaium-backup-*.dump | tail -n +"$((RETENTION_DAILY + 1))" | xargs rm --
  echo "[$(date -Iseconds)] Daily retention applied (keep ${RETENTION_DAILY})"
fi

# ── Retention: remove old weekly backups ─────────────────────────────────────
WEEKLY_COUNT=$(ls -1 "${BACKUP_DIR}/weekly"/musaium-backup-*.dump 2>/dev/null | wc -l)
if [ "${WEEKLY_COUNT}" -gt "${RETENTION_WEEKLY}" ]; then
  ls -1t "${BACKUP_DIR}/weekly"/musaium-backup-*.dump | tail -n +"$((RETENTION_WEEKLY + 1))" | xargs rm --
  echo "[$(date -Iseconds)] Weekly retention applied (keep ${RETENTION_WEEKLY})"
fi

# ── Optional: heartbeat ping ─────────────────────────────────────────────────
if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
  curl -fsS -o /dev/null "${BACKUP_HEARTBEAT_URL}" || true
  echo "[$(date -Iseconds)] Heartbeat sent"
fi

echo "[$(date -Iseconds)] Backup pipeline complete"
