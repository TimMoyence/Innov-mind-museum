#!/usr/bin/env bash
# Runs INSIDE the reactivecircus/android-emulator-runner once the AVD has booted.
# The action invokes this as a single line (`bash …/maestro-emulator-script.sh
# <shard>`), so — unlike a multi-line inline `script:` where each line runs in
# its own shell — normal shell state (cwd, vars) persists here.
#
# Paths are repo-root-relative: the action's cwd is the workspace root, and the
# prebuild APK was downloaded to museum-frontend/android/app/build/outputs/apk/.
set -uo pipefail

SHARD="${1:?usage: maestro-emulator-script.sh <shard>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

adb install -r "$ROOT/museum-frontend/android/app/build/outputs/apk/release/app-release.apk"

# T9.x — push the chat-compare fixture so the picker surfaces it as the most
# recent local asset. Harmless on shards that don't use it (|| true).
FIXTURE="$ROOT/museum-frontend/.maestro/fixtures/test-artwork.jpg"
if [ -f "$FIXTURE" ]; then
  adb push "$FIXTURE" /sdcard/Download/test-artwork.jpg || true
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
    -d file:///sdcard/Download/test-artwork.jpg || true
fi

bash "$ROOT/museum-frontend/scripts/maestro-run-shard.sh" "$SHARD"
