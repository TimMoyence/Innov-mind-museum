#!/usr/bin/env bash
#
# Post-deploy smoke for the C1 Grafana iframe path.
#
# Asserts the single-auth contract: nginx auth_request gates `/grafana/*`
# behind `GET /api/auth/super-admin-check`.
#
#   401 — anonymous OR non-super-admin user
#   200 — super_admin user (Grafana dashboard payload)
#
# Usage:
#   BASE_URL=https://musaium.fr \
#   SUPER_ADMIN_EMAIL=tim.moyence@gmail.com \
#   SUPER_ADMIN_PASSWORD=... \
#   ADMIN_EMAIL=somemuseum@example.com \
#   ADMIN_PASSWORD=... \
#   ./scripts/smoke-grafana-prod.sh
#
# Exit codes:
#   0 — all 3 assertions pass
#   1 — anonymous gate failed (returned 2xx without auth)
#   2 — super_admin login failed
#   3 — super_admin gate failed (got non-2xx after login)
#   4 — admin gate failed (got 2xx, should have been 401)
#   5 — required env var missing

set -euo pipefail

BASE_URL="${BASE_URL:-https://musaium.fr}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:?SUPER_ADMIN_EMAIL required}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:?SUPER_ADMIN_PASSWORD required}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

cookie_jar="$(mktemp)"
trap 'rm -f "$cookie_jar" "${cookie_jar}.admin"' EXIT

echo "▶ Checking anonymous /grafana/ returns 401..."
status="$(curl -s -o /dev/null -w '%{http_code}' \
  --max-time 10 \
  "${BASE_URL}/grafana/d/chat-latency")"
if [ "$status" = "401" ] || [ "$status" = "403" ]; then
  echo "  ✓ anonymous → ${status}"
else
  echo "  ✗ anonymous returned ${status} (expected 401/403)" >&2
  exit 1
fi

echo "▶ Logging in as super_admin (${SUPER_ADMIN_EMAIL})..."
login_status="$(curl -s -o /dev/null -w '%{http_code}' \
  --max-time 10 \
  -c "$cookie_jar" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${SUPER_ADMIN_EMAIL}\",\"password\":\"${SUPER_ADMIN_PASSWORD}\"}" \
  "${BASE_URL}/api/auth/login")"
if [ "$login_status" != "200" ]; then
  echo "  ✗ super_admin login returned ${login_status} (expected 200)" >&2
  exit 2
fi
echo "  ✓ super_admin session cookie obtained"

echo "▶ Checking super_admin /grafana/ returns 2xx..."
status="$(curl -s -o /dev/null -w '%{http_code}' \
  --max-time 10 \
  -b "$cookie_jar" \
  "${BASE_URL}/grafana/d/chat-latency")"
if [ "$status" -ge 200 ] && [ "$status" -lt 400 ]; then
  echo "  ✓ super_admin → ${status}"
else
  echo "  ✗ super_admin returned ${status} (expected 2xx/3xx)" >&2
  exit 3
fi

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "▶ Checking admin (B2B) /grafana/ returns 401..."
  curl -s -o /dev/null \
    --max-time 10 \
    -c "${cookie_jar}.admin" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    "${BASE_URL}/api/auth/login" > /dev/null
  status="$(curl -s -o /dev/null -w '%{http_code}' \
    --max-time 10 \
    -b "${cookie_jar}.admin" \
    "${BASE_URL}/grafana/d/chat-latency")"
  if [ "$status" = "401" ] || [ "$status" = "403" ]; then
    echo "  ✓ admin → ${status}"
  else
    echo "  ✗ admin returned ${status} (expected 401/403 — admin must NOT see ops)" >&2
    exit 4
  fi
else
  echo "▶ Skipping admin negative test (ADMIN_EMAIL / ADMIN_PASSWORD not set)"
fi

echo
echo "✅ Grafana iframe RBAC smoke OK"
