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
# A warm restart answers /api/health in ~1-2s (node process kept running), so a
# tight ceiling here makes a genuinely hung warm container fail fast — good DX.
# A COLD boot is different : right after a bake-key rebuild the backend boots via
# ts-node WITHOUT a transpile cache and type-checks the whole project on first
# require (tsconfig "files": true → src+tests+scripts), so dataSource.initialize()
# alone compiled entities + 64 migrations in ~86s on a dev laptop (total boot
# ~114s, measured 2026-06-01). 75s under-shot that → false "never became healthy".
# So : keep the tight warm ceiling, but widen it only on the rebuild path below.
HEALTH_TIMEOUT_WARM=75
HEALTH_TIMEOUT_COLD=180
HEALTH_TIMEOUT=$HEALTH_TIMEOUT_WARM
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

# ---- 1.6. Image bake-key freshness check ----
# Detect when any input COPY'd into the dev-backend image at build time has
# changed since the last `docker compose build` — and rebuild automatically.
# Replaces the lockfile-only WARN-sentinel (which missed packages/musaium-shared
# dist drift, Dockerfile edits, eslint-plugin-musaium-test-discipline changes).
#
# Mechanism : Dockerfile.dev carries a LABEL musaium.dev-bake-key=<sha256> set
# from an --build-arg at build time. The wrapper hashes the same input set via
# `git hash-object` (stable across mtime/permissions/branches/worktrees) and
# compares. Mismatch → rebuild + recreate backend (anon volumes renewed to
# guarantee /app/museum-backend/node_modules matches the new lockfile). Match
# → no-op (idempotent).
#
# INPUT_PATHS must mirror the COPY directives in museum-backend/Dockerfile.dev.
# Tracked files only (untracked excluded by `git ls-files`) — matches what
# Docker sees once .dockerignore filters apply.
step "1.6/5 Checking dev-backend image bake-key freshness"
INPUT_PATHS=(
  museum-backend/Dockerfile.dev
  museum-backend/package.json
  museum-backend/pnpm-lock.yaml
  packages/musaium-shared
  tools/eslint-plugin-musaium-test-discipline
)
CURRENT_KEY=$(cd "$ROOT" && git ls-files -z "${INPUT_PATHS[@]}" 2>/dev/null \
  | xargs -0 git hash-object 2>/dev/null \
  | sha256sum 2>/dev/null \
  | cut -c1-16)

# docker compose project name = directory of the compose file = "museum-backend"
# → image tag for the `backend` service is "museum-backend-backend".
IMAGE_TAG="museum-backend-backend"
BAKED_KEY=$(docker image inspect "$IMAGE_TAG" \
  --format '{{ index .Config.Labels "musaium.dev-bake-key" }}' 2>/dev/null || echo "")

if [ -z "${CURRENT_KEY:-}" ]; then
  warn "Could not compute current bake-key (git missing or repo issue) — skipping freshness check"
elif [ "$CURRENT_KEY" = "$BAKED_KEY" ]; then
  ok "Image bake-key match ($CURRENT_KEY) — no rebuild needed"
else
  if [ -z "$BAKED_KEY" ]; then
    warn "No bake-key on image (first build, pruned, or pre-bake-key image) → building"
  else
    warn "Bake-key mismatch (image=$BAKED_KEY current=$CURRENT_KEY) → rebuilding"
  fi

  # Capture the backend's current anonymous volumes BEFORE recreate. Docker
  # anon volumes are SHA-derived (64 hex) ; named volumes always start with the
  # project prefix like "museum-backend_". `--renew-anon-volumes` detaches but
  # does NOT remove the old ones → they accumulate as danglings (~800 MB each
  # for node_modules ; observed 3.4 GB after 5 rebuilds on a single dev host).
  # E2E teardown already solves this via `docker rm -f -v` (atomic) ; we port
  # the same discipline to dev. cf feedback_zero_bypass.md corollary 2026-05-17.
  OLD_BACKEND_ANON_VOLUMES=$(docker inspect dev-backend \
    --format '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}' \
    2>/dev/null | grep -E '^[a-f0-9]{64}$' || true)

  # Cold boot ahead : the freshly rebuilt image has no ts-node transpile cache,
  # so widen the health ceiling (see HEALTH_TIMEOUT_COLD note above).
  HEALTH_TIMEOUT=$HEALTH_TIMEOUT_COLD

  $DOCKER_COMPOSE build --build-arg "BAKE_KEY=$CURRENT_KEY" backend
  $DOCKER_COMPOSE up -d --force-recreate --renew-anon-volumes backend

  if [ -n "${OLD_BACKEND_ANON_VOLUMES:-}" ]; then
    # xargs -n 1 : one `docker volume rm` per ID. More tolerant than a single
    # call (a single in-use volume would otherwise abort the whole batch) and
    # immune to bash word-splitting quirks across shells.
    REMOVED=$(printf '%s\n' "$OLD_BACKEND_ANON_VOLUMES" \
      | xargs -n 1 docker volume rm 2>/dev/null | wc -l | tr -d ' ')
    TOTAL=$(printf '%s\n' "$OLD_BACKEND_ANON_VOLUMES" | wc -l | tr -d ' ')
    if [ "$REMOVED" -eq "$TOTAL" ]; then
      ok "Image rebuilt + backend recreated + $REMOVED stale anon volume(s) reclaimed"
    else
      ok "Image rebuilt + backend recreated + $REMOVED/$TOTAL stale anon volume(s) reclaimed"
      warn "$((TOTAL - REMOVED)) old anon volume(s) still in use elsewhere — left in place"
    fi
  else
    ok "Image rebuilt + backend recreated with fresh anon volumes"
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
