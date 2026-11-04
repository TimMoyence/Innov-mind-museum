#!/usr/bin/env bash
# Seeds the fixed Maestro accounts straight into the e2e database (bypasses the
# HTTP register breach-check). Each seed deletes then recreates its account, so
# running this before every shard attempt hands every attempt fresh accounts:
# the one auth-account-delete destroys, and quotas spent by the previous attempt.
#
# DB coordinates default to the CI service container; the iOS job passes
# DB_PORT=5433 (local docker compose).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT/museum-backend"

export E2E_SEED_ALLOW=1
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-5432}"
export DB_USER="${DB_USER:-museum_dev}"
export DB_PASSWORD="${DB_PASSWORD:-museum_dev_password}"
export PGDATABASE="${PGDATABASE:-museum_dev}"

seed() {
  E2E_LOGIN_EMAIL="$1" E2E_LOGIN_PASSWORD="$2" E2E_EXHAUST_QUOTA="${3:-}" pnpm seed:e2e-maestro-account
}

seed e2e-test-login@test.musaium.dev 'TestPassword123!'
seed apple.test@apple.com 'Apple1234!'
seed e2e-delete@test.musaium.dev 'TestPassword123!'
seed e2e-paywall@test.musaium.dev 'TestPassword123!' 1
