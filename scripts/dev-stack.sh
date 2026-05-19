#!/usr/bin/env bash
# scripts/dev-stack.sh
#
# All-in-one local dev orchestrator for Musaium mobile sprint.
# Workflow :
#   1. Verify Docker daemon
#   2. Start museum-backend Docker stack (Postgres + Redis + Adminer + backend)
#      if not already up
#   3. Wait for backend /api/health → 200
#   4. Switch museum-frontend/.env to .env.local-dev (cert pinning OFF,
#      localhost:3000, APP_VARIANT=development)
#   5. Open museum-frontend/ios/Musaium.xcworkspace in Xcode (background)
#   6. Start Metro in foreground — Ctrl+C stops Metro, Docker stays up
#
# To stop Docker stack when done: ./scripts/dev-stack-down.sh
# Generated 2026-05-17 by /team local-mobile-env-viable run.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/museum-backend"
FRONTEND="$ROOT/museum-frontend"
IOS_WORKSPACE="$FRONTEND/ios/Musaium.xcworkspace"
HEALTH_URL="http://localhost:3000/api/health"
HEALTH_TIMEOUT=30
DOCKER_COMPOSE="docker compose -f $BACKEND/docker-compose.dev.yml"

# Color helpers (only if stdout is a TTY)
if [ -t 1 ]; then
  C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'; C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
else
  C_BLUE=; C_GREEN=; C_YELLOW=; C_RED=; C_RESET=; C_BOLD=
fi

step() { echo "${C_BLUE}${C_BOLD}▶ $1${C_RESET}"; }
ok()   { echo "${C_GREEN}✓ $1${C_RESET}"; }
warn() { echo "${C_YELLOW}⚠ $1${C_RESET}"; }
fail() { echo "${C_RED}✗ $1${C_RESET}" >&2; exit 1; }

# ---- 1. Docker daemon ----
step "1/5 Checking Docker daemon"
if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon not running. Start Docker Desktop first."
fi
ok "Docker daemon UP"

# ---- 2. Docker stack ----
step "2/5 Checking Docker stack (dev-backend, dev-postgres, dev-redis, dev-adminer)"
RUNNING_COUNT=$($DOCKER_COMPOSE ps --status running --services 2>/dev/null | wc -l | tr -d ' ')
EXPECTED_COUNT=$($DOCKER_COMPOSE config --services 2>/dev/null | wc -l | tr -d ' ')

if [ "$RUNNING_COUNT" -lt "$EXPECTED_COUNT" ]; then
  warn "Docker stack incomplete ($RUNNING_COUNT/$EXPECTED_COUNT services running). Starting..."
  $DOCKER_COMPOSE up -d
else
  ok "Docker stack UP ($RUNNING_COUNT/$EXPECTED_COUNT services)"
fi

# ---- 3. Backend health ----
step "3/5 Waiting for backend health on $HEALTH_URL (timeout ${HEALTH_TIMEOUT}s)"
ELAPSED=0
while [ "$ELAPSED" -lt "$HEALTH_TIMEOUT" ]; do
  if HEALTH_BODY=$(curl -sf -m 2 "$HEALTH_URL" 2>/dev/null); then
    DB_STATUS=$(echo "$HEALTH_BODY" | sed -n 's/.*"database":"\([^"]*\)".*/\1/p')
    ok "Backend healthy — db=$DB_STATUS"
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  printf "."
done

if [ "$ELAPSED" -ge "$HEALTH_TIMEOUT" ]; then
  fail "Backend never became healthy after ${HEALTH_TIMEOUT}s. Check: $DOCKER_COMPOSE logs backend"
fi

# ---- 4. Frontend .env switch ----
step "4/5 Switching museum-frontend/.env → .env.local-dev"
if [ ! -f "$FRONTEND/.env.local-dev" ]; then
  fail "Template missing: $FRONTEND/.env.local-dev. Create from .env.local.example."
fi
cp "$FRONTEND/.env.local-dev" "$FRONTEND/.env"
ACTIVE_URL=$(grep -E "^EXPO_PUBLIC_API_BASE_URL=" "$FRONTEND/.env" | head -1 | cut -d= -f2)
ACTIVE_VARIANT=$(grep -E "^APP_VARIANT=" "$FRONTEND/.env" | head -1 | cut -d= -f2)
ACTIVE_PIN=$(grep -E "^EXPO_PUBLIC_CERT_PINNING_ENABLED=" "$FRONTEND/.env" | head -1 | cut -d= -f2)
ok ".env active — URL=$ACTIVE_URL VARIANT=$ACTIVE_VARIANT CERT_PIN=$ACTIVE_PIN"

# ---- 5. Open Xcode + Metro ----
step "5/5 Opening Xcode workspace in background"
if [ ! -d "$IOS_WORKSPACE" ]; then
  warn "Xcode workspace not found at $IOS_WORKSPACE — skipping (run 'npx expo prebuild' first)"
else
  open -a Xcode "$IOS_WORKSPACE"
  ok "Xcode opened — press Cmd+R to build & run on simulator"
fi

echo ""
echo "${C_GREEN}${C_BOLD}═══════════════════════════════════════════════════${C_RESET}"
echo "${C_GREEN}${C_BOLD} Stack ready. Starting Metro now (Ctrl+C to stop). ${C_RESET}"
echo "${C_GREEN}${C_BOLD} Docker stays up — stop it with: pnpm dev:stack:down${C_RESET}"
echo "${C_GREEN}${C_BOLD}═══════════════════════════════════════════════════${C_RESET}"
echo ""

# Foreground Metro — when user Ctrl+C, only Metro stops
cd "$FRONTEND"
exec npm run dev
