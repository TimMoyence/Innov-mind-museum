#!/usr/bin/env bash
set -euo pipefail

MUSAIUM_DIR="${MUSAIUM_DIR:-/srv/museum}"
. "${MUSAIUM_DIR}/backup.env"
. "$(dirname "$0")/heartbeat.sh"

MIN_VALID_DAYS=21

trap 'heartbeat CERT_HEARTBEAT_URL fail || true' ERR

certificates="$(docker exec reverse-proxy-certbot-1 certbot certificates)"
shortest="$(printf '%s\n' "${certificates}" | sed -n 's/.*(VALID: \([0-9]*\) days*).*/\1/p' | sort -n | head -n 1)"
invalid="$(printf '%s\n' "${certificates}" | grep -c -E 'INVALID|VALID: [0-9]+ hour' || true)"

[ -n "${shortest}" ]
[ "${shortest}" -ge "${MIN_VALID_DAYS}" ]
[ "${invalid}" -eq 0 ]

heartbeat CERT_HEARTBEAT_URL
