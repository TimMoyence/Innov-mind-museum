#!/usr/bin/env bash
# =============================================================================
# Build + install the iOS Maestro e2e app on a booted simulator.
# =============================================================================
# WHY THIS SCRIPT EXISTS (2026-07-14).
#
# The local e2e build recipe was tribal knowledge — a block of `export` lines
# passed around by hand. So somebody did the reasonable thing and moved one of the
# flags into `museum-frontend/.env`, where it cannot be forgotten.
#
# That is exactly the wrong place. Metro INLINES every `EXPO_PUBLIC_*` it finds in
# `.env` into the JS bundle at build time, with no runtime opt-out. A test seam in
# that file is not a convenience, it is a production defect that ships:
#   • EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE → a STUBBED MICROPHONE in every archive
#   • EXPO_PUBLIC_E2E_DEV_ROUTES        → dev-only screens reachable in Release
#   • EXPO_PUBLIC_E2E_LOCAL_BACKEND     → an API base URL pointing at localhost
#                                          (cf. INC-2026-06-06-build-localhost)
#
# `scripts/sentinels/e2e-flags-not-in-env.mjs` (pre-push Gate 36) now refuses any
# of them in an env file. This script is the other half of that deal: the seams
# live HERE, on the build command, where they are scoped to the build that needs
# them and can never reach a shipped bundle.
#
# Usage:
#   scripts/build-ios-e2e.sh                 # build + install on the booted sim
#   API_BASE_URL=http://192.168.1.20:3000 \
#     scripts/build-ios-e2e.sh               # e.g. a device on the LAN
#
# Prerequisites: a booted iOS simulator (`xcrun simctl list devices | grep Booted`)
# and a backend reachable at $API_BASE_URL (`docker compose -f
# museum-backend/docker-compose.dev.yml up -d`).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_DIR="$FE_ROOT/ios"

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

# ── The booted simulator ─────────────────────────────────────────────────────
DEVICE_UDID="$(xcrun simctl list devices booted -j \
  | python3 -c 'import json,sys; d=json.load(sys.stdin)["devices"]; print(next((x["udid"] for v in d.values() for x in v if x.get("state")=="Booted"), ""))')"

if [ -z "$DEVICE_UDID" ]; then
  echo "[build-ios-e2e] ✗ no booted simulator." >&2
  echo "                Boot one, e.g.:  xcrun simctl boot <udid>" >&2
  echo "                (scripts/pick-ios-simulator.mjs prints a runtime + device type)" >&2
  exit 1
fi
echo "[build-ios-e2e] simulator: $DEVICE_UDID"

# ── The e2e build seams — ON THE COMMAND LINE, never in a file ───────────────
export APP_VARIANT=development
export EXPO_PUBLIC_API_ENVIRONMENT=staging
export EXPO_PUBLIC_API_BASE_URL="$API_BASE_URL"
# Dedicated seam: a Release build would otherwise resolve variant=production and
# point at the real API (api-url.config.js).
export EXPO_PUBLIC_E2E_LOCAL_BACKEND=1
# The (dev) route group is gated on THIS, not on __DEV__: an e2e binary is a
# RELEASE binary, so `__DEV__ === false` and anything gated on it is dead code
# inside it — the flows that deeplinked those routes were passing green while
# testing nothing (CLAUDE.md § Pièges connus).
export EXPO_PUBLIC_E2E_DEV_ROUTES=true
# Maestro cannot drive a real microphone; this seam injects the bundled clip so
# the STT→TTS round-trip is deterministic (features/chat/application/maestroAudioFixture.ts).
export EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE=true
# Expo SDK 55 + Metro: without this the Release bundle step 404s on the entry.
export ENTRY_FILE=node_modules/expo-router/entry.js
export SENTRY_DISABLE_AUTO_UPLOAD=true

# NOTE — deliberately NOT setting CODE_SIGNING_ALLOWED=NO. An unsigned binary has
# no entitlements ⇒ no keychain access group ⇒ expo-secure-store fails with
# errSecMissingEntitlement (-34018) ⇒ the auth token never persists ⇒ LOGIN IS
# IMPOSSIBLE and every flow dies at the first screen. A simulator build with no
# signature flags at all takes the ad-hoc "Sign to Run Locally" identity, which
# needs no cert and no team, and the keychain works. Do not "fix" this.
# Also do NOT add DEVELOPMENT_TEAM — a simulator build ignores it.

echo "[build-ios-e2e] xcodebuild (Release, iphonesimulator) …"
cd "$IOS_DIR"
xcodebuild \
  -workspace Musaium.xcworkspace \
  -scheme Musaium \
  -configuration Release \
  -sdk iphonesimulator \
  -derivedDataPath build \
  build

APP_PATH="$IOS_DIR/build/Build/Products/Release-iphonesimulator/Musaium.app"
[ -d "$APP_PATH" ] || { echo "[build-ios-e2e] ✗ missing $APP_PATH" >&2; exit 1; }

echo "[build-ios-e2e] installing on $DEVICE_UDID …"
xcrun simctl install "$DEVICE_UDID" "$APP_PATH"

# The CI seeds the simulator photo library; a local run must too, or the
# artwork-hero / image-fullscreen flows fail on an empty picker with no hint why
# (ci-cd-mobile.yml does `simctl addmedia`).
FIXTURE="$FE_ROOT/.maestro/fixtures/test-artwork.jpg"
if [ -f "$FIXTURE" ]; then
  xcrun simctl addmedia "$DEVICE_UDID" "$FIXTURE" || true
  echo "[build-ios-e2e] seeded photo library with $(basename "$FIXTURE")"
fi

echo "[build-ios-e2e] ✔ installed. Backend must be reachable at $API_BASE_URL"
echo "[build-ios-e2e]   run:  DB_HOST=localhost DB_PORT=5433 scripts/maestro-run-shard.sh ios-main"
