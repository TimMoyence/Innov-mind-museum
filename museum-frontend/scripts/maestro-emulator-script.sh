#!/usr/bin/env bash
set -uo pipefail

SHARD="${1:?usage: maestro-emulator-script.sh <shard>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

adb install -r "$ROOT/museum-frontend/android/app/build/outputs/apk/release/app-release.apk"

FIXTURE="$ROOT/museum-frontend/.maestro/fixtures/test-artwork.jpg"
if [ -f "$FIXTURE" ]; then
  adb push "$FIXTURE" /sdcard/Download/test-artwork.jpg || true
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
    -d file:///sdcard/Download/test-artwork.jpg || true
fi

bash "$ROOT/museum-frontend/scripts/maestro-seed-accounts.sh"

bash "$ROOT/museum-frontend/scripts/maestro-run-shard.sh" "$SHARD"
