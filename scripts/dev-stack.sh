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

# ---- 1.5. Mount-source sentinel ----
# Detect a dev-backend container whose `/app/museum-backend` bind points at a
# host path that is NOT this repo's museum-backend (typically a worktree that
# has since been deleted, or a different InnovMind clone). Symptom : /api/health
# answers OK because handlers were warmed in memory, but the first lazy require
# (body-parser → iconv-lite/encodings, BullMQ worker, Sentry instrumentation…)
# fails with `Cannot find module …` → opaque 400s and zombie workers. The
# RUNNING_COUNT=EXPECTED_COUNT branch below would otherwise hand control to the
# stale container instead of recreating it. First seen 2026-05-20 against a
# stale InnovMind-W3 worktree mount.
step "1.5/5 Checking dev-backend bind-mount matches this repo"
EXPECTED_BIND="$BACKEND"
CURRENT_BIND=$(docker inspect dev-backend \
  --format '{{range .Mounts}}{{if eq .Destination "/app/museum-backend"}}{{.Source}}{{end}}{{end}}' \
  2>/dev/null || true)
if [ -z "${CURRENT_BIND:-}" ]; then
  ok "dev-backend not present yet — Step 2 will create it with bind=$EXPECTED_BIND"
elif [ "$CURRENT_BIND" = "$EXPECTED_BIND" ]; then
  ok "dev-backend bind matches repo ($EXPECTED_BIND)"
else
  warn "dev-backend bind-source mismatch detected :"
  warn "  expected (this repo) : $EXPECTED_BIND"
  warn "  current  (container) : $CURRENT_BIND"
  warn "Forcing '$DOCKER_COMPOSE down' to recreate the stack with the correct mount."
  $DOCKER_COMPOSE down
  ok "Stale stack torn down — Step 2 will recreate it fresh"
fi

# ---- 1.6. Lockfile freshness sentinel ----
# Detect when museum-backend/pnpm-lock.yaml has been modified more recently
# than dev-backend was last started. The anonymous volume backing
# /app/museum-backend/node_modules is populated ONCE during image build by
# `pnpm install --frozen-lockfile` (Dockerfile.dev) and is reused as-is on
# subsequent `docker compose up`. Any dep added to the lockfile after the
# image was built has no top-level symlink in the volume, even though the
# `.pnpm/` content-addressable store may contain it — imports then fail with
# TS2307 / MODULE_NOT_FOUND at runtime. WARN-only : the rebuild
# (`down && up --build --renew-anon-volumes`) drops the volume and is
# destructive enough to keep behind manual confirmation. First seen 2026-05-20
# against a missing `@opentelemetry/api` symlink after a W4 deps bump.
step "1.6/5 Checking pnpm-lock.yaml freshness vs dev-backend last start"
LOCK_MTIME=$(stat -f %m "$BACKEND/pnpm-lock.yaml" 2>/dev/null \
          || stat -c %Y "$BACKEND/pnpm-lock.yaml" 2>/dev/null \
          || echo 0)
CONTAINER_STARTED_AT=$(docker inspect dev-backend --format '{{.State.StartedAt}}' 2>/dev/null || true)
if [ -z "${CONTAINER_STARTED_AT:-}" ] || [ "$LOCK_MTIME" -eq 0 ]; then
  ok "No prior dev-backend (or lockfile unreadable) — skipping freshness check"
else
  # Strip subseconds + trailing Z, parse as UTC (macOS BSD date + GNU date portable).
  CONTAINER_TS_TRIMMED=$(echo "$CONTAINER_STARTED_AT" | cut -c1-19)
  CONTAINER_EPOCH=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "$CONTAINER_TS_TRIMMED" +%s 2>/dev/null \
                 || date -u -d "$CONTAINER_STARTED_AT" +%s 2>/dev/null \
                 || echo 0)
  if [ "$CONTAINER_EPOCH" -eq 0 ]; then
    warn "Could not parse container StartedAt ($CONTAINER_STARTED_AT) — skipping freshness check"
  elif [ "$LOCK_MTIME" -gt "$CONTAINER_EPOCH" ]; then
    warn "pnpm-lock.yaml is newer than dev-backend's last start :"
    warn "  lockfile mtime  : $(date -r "$LOCK_MTIME" '+%Y-%m-%dT%H:%M:%S%z' 2>/dev/null || date -d "@$LOCK_MTIME" '+%Y-%m-%dT%H:%M:%S%z')"
    warn "  container start : $CONTAINER_STARTED_AT"
    warn ""
    warn "Anon volume /app/museum-backend/node_modules may be missing newly-added"
    warn "top-level deps. If the backend crashes with TS2307 / MODULE_NOT_FOUND, run :"
    warn "  $DOCKER_COMPOSE down \\"
    warn "    && $DOCKER_COMPOSE up -d --build --force-recreate --renew-anon-volumes"
  else
    ok "Lockfile mtime <= container start — anon node_modules volume should be fresh"
  fi
fi

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

# ---- 3.5. Migration sync (catches schema drift before the FE talks to a stale DB) ----
step "3.5/5 Checking DB schema sync (migrations table vs source)"
if bash "$ROOT/scripts/dev-migration-check.sh"; then
  : # in sync, all good
else
  STATUS=$?
  if [ "$STATUS" = "1" ]; then
    warn "Pending migrations. Apply now? [Y/n]"
    read -r REPLY
    if [ -z "$REPLY" ] || [ "$REPLY" = "Y" ] || [ "$REPLY" = "y" ]; then
      docker exec dev-backend pnpm migration:run
      ok "Migrations applied"
    else
      fail "Aborted. Run 'docker exec dev-backend pnpm migration:run' manually then re-run dev:stack."
    fi
  else
    fail "Migration check setup failure (exit $STATUS). See output above."
  fi
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

# ---- 4.5. Kill orphan Metro on 8081 (left over from previous sessions) ----
# Without this guard, expo start fallbacks to 8083 silently — the app on the
# simulator (built against 8081) then can't find Metro. Idempotent.
#
# NOTE the `|| true` chain : `lsof` exits 1 when no listener matches, and
# `set -euo pipefail` combined with `var=$(cmd|head)` would abort the script.
# We tolerate the non-zero exit explicitly.
step "4.5/5 Cleaning orphan Metro on :8081 if any"
ORPHAN_PID=$( { lsof -nP -iTCP:8081 -sTCP:LISTEN -t 2>/dev/null || true; } | head -1 || true)
if [ -n "${ORPHAN_PID:-}" ]; then
  warn "Orphan Metro (PID $ORPHAN_PID) holding :8081 — killing"
  kill "$ORPHAN_PID" 2>/dev/null || true
  sleep 1
  ok "Port :8081 freed"
else
  ok "Port :8081 already free"
fi

# ---- 4.6. Pre-boot iPhone 17 Pro simulator (avoid stale UUID lookup by Expo) ----
# Expo CLI's `--ios` auto-pick falls back to a remembered UUID that may point
# at a deleted simulator (Xcode 26 sim cleanup, OS reinstalls). Pre-boot a
# known-good device so `--ios` finds it and skips the fallback path.
step "4.6/5 Pre-booting iPhone 17 Pro simulator"
SIM_NAME="iPhone 17 Pro"
SIM_UDID=$( { xcrun simctl list devices available 2>/dev/null || true; } | grep "$SIM_NAME (" | head -1 | sed -E 's/.*\(([A-F0-9-]+)\) \(.*$/\1/' || true)
if [ -z "${SIM_UDID:-}" ]; then
  warn "Simulator '$SIM_NAME' not found — Xcode + Expo will fall back to next available device"
else
  CURRENT_STATE=$( { xcrun simctl list devices 2>/dev/null || true; } | grep "$SIM_UDID" | sed -E 's/.*\((Booted|Shutdown)\).*$/\1/' || true)
  if [ "$CURRENT_STATE" = "Booted" ]; then
    ok "$SIM_NAME already booted ($SIM_UDID)"
  else
    if xcrun simctl boot "$SIM_UDID" >/dev/null 2>&1; then
      ok "$SIM_NAME booted ($SIM_UDID)"
    else
      warn "Could not boot $SIM_NAME (may already be booted by Simulator.app)"
    fi
  fi
  open -a Simulator --args -CurrentDeviceUDID "$SIM_UDID" >/dev/null 2>&1 || true
fi

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
