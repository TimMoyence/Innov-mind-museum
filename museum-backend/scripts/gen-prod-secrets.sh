#!/usr/bin/env bash
#
# gen-prod-secrets.sh — generate the museum-backend production app secrets.
#
# Emits the 7 app secrets + REDIS_PASSWORD that `validateProductionEnv`
# (src/config/env.production-validation.ts) hard-gates at boot. Each is
# `openssl rand -hex 32` (64 hex chars, >= the 32-char minimum) and every
# value is produced by an independent draw, so they satisfy the mutual
# distinctness matrix (collision probability ~ 2^-256).
#
# UFR-013 — these are REAL secrets. Run it in YOUR terminal, pipe the output
# straight into your CI/CD secret store (GitHub Actions → OVH VPS). NEVER
# commit the output, never paste it into a chat. The repo only stores this
# generator, never its product.
#
# Usage:
#   bash scripts/gen-prod-secrets.sh                 # print to stdout
#   bash scripts/gen-prod-secrets.sh >> .env.secrets # append to a gitignored file
#
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
MFA_ENCRYPTION_KEY=$(gen)
MFA_SESSION_TOKEN_SECRET=$(gen)
EXPORT_PSEUDONYM_SALT=$(gen)
REDIS_PASSWORD=$(gen)
EOF
