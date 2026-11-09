#!/usr/bin/env bash
set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "error: openssl not found on PATH" >&2
  exit 1
fi

gen() { openssl rand -hex 32; }

cat <<EOF
# --- museum-backend production app secrets (generated $(date -u +%Y-%m-%dT%H:%M:%SZ)) ---
# Each value is 64 hex chars (>= 32 required) and mutually distinct.
# Hard-gated by src/config/env.production-validation.ts (presence + length + distinctness).
JWT_ACCESS_SECRET=$(gen)
JWT_REFRESH_SECRET=$(gen)
CSRF_SECRET=$(gen)
MEDIA_SIGNING_SECRET=$(gen)
EXPORT_PSEUDONYM_SALT=$(gen)
REDIS_PASSWORD=$(gen)
EOF
