#!/usr/bin/env bash
# extract-crash-context.sh
#
# Pulls the iOS 26 / A18 Pro launch-crash post-mortem context written by
# RNCrashCapture (ios/Musaium/AppDelegate.swift) plus the matching
# [MUSAIUM_INIT] / [MUSAIUM_CRASH] device-log lines.
#
# Sources, in priority order:
#   1. Booted simulator app sandbox  -> NSTemporaryDirectory()/musaium-crash-context.json
#   2. Connected iOS device app sandbox via `idevicesyslog` (libimobiledevice) when installed
#   3. macOS `log` command for [MUSAIUM_INIT|CRASH] entries since the last launch
#
# Usage:
#   ./scripts/extract-crash-context.sh                  # auto-detect, print timeline to stdout
#   ./scripts/extract-crash-context.sh --json           # raw JSON, one event per line
#   ./scripts/extract-crash-context.sh --since '5m'     # restrict log lookups to last N minutes
#
# Doc: museum-frontend/docs/IOS26_CRASH_DIAG.md
set -euo pipefail

JSON_ONLY=false
SINCE="10m"
APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.musaium.mobile}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON_ONLY=true; shift ;;
    --since) SINCE="$2"; shift 2 ;;
    --bundle-id) APP_BUNDLE_ID="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

log_section() {
  $JSON_ONLY && return
  echo
  echo "=== $1 ==="
}

# --- 1. Try booted simulator sandbox -----------------------------------------
SIMCTL_OK=false
if command -v xcrun >/dev/null 2>&1 && xcrun simctl list devices booted 2>/dev/null | grep -q Booted; then
  SIM_DATA_DIR="$(xcrun simctl get_app_container booted "$APP_BUNDLE_ID" data 2>/dev/null || true)"
  if [[ -n "$SIM_DATA_DIR" && -d "$SIM_DATA_DIR/tmp" ]]; then
    CTX_FILE="$SIM_DATA_DIR/tmp/musaium-crash-context.json"
    if [[ -f "$CTX_FILE" ]]; then
      SIMCTL_OK=true
      log_section "Crash context (simulator sandbox: $CTX_FILE)"
      cat "$CTX_FILE"
    fi
  fi
fi

# --- 2. Try connected iOS device via libimobiledevice ------------------------
DEVICE_OK=false
if ! $SIMCTL_OK && command -v idevice_id >/dev/null 2>&1; then
  UDID="$(idevice_id -l 2>/dev/null | head -1 || true)"
  if [[ -n "$UDID" ]]; then
    log_section "Connected device UDID: $UDID"
    if command -v ifuse >/dev/null 2>&1; then
      MOUNT_POINT="$(mktemp -d)"
      if ifuse --documents "$APP_BUNDLE_ID" "$MOUNT_POINT" 2>/dev/null; then
        # tmp dir lives alongside Documents; AFC exposes the app sandbox's Documents only
        # so users must enable file sharing in Info.plist OR tail the device log instead.
        if [[ -f "$MOUNT_POINT/musaium-crash-context.json" ]]; then
          DEVICE_OK=true
          log_section "Crash context (device sandbox)"
          cat "$MOUNT_POINT/musaium-crash-context.json"
        fi
        fusermount -u "$MOUNT_POINT" 2>/dev/null || umount "$MOUNT_POINT" 2>/dev/null || true
      fi
      rmdir "$MOUNT_POINT" 2>/dev/null || true
    fi
  fi
fi

# --- 3. macOS device-log fallback (works for simulator + USB-attached) -------
if ! $JSON_ONLY; then
  log_section "Device log (last $SINCE, [MUSAIUM_*] tags)"
  if command -v log >/dev/null 2>&1; then
    log show --predicate 'eventMessage CONTAINS "MUSAIUM_"' --info --last "$SINCE" 2>/dev/null | tail -200 || true
  else
    echo "macOS 'log' command unavailable; skipping device log scan."
  fi
fi

if ! $SIMCTL_OK && ! $DEVICE_OK && ! $JSON_ONLY; then
  log_section "No crash-context file found"
  cat <<'EOF'
Nothing was recovered from a booted simulator or USB-attached device.

If you were debugging a TestFlight crash:
  - Capture the .ips crash log from the device's "Privacy & Security -> Analytics" pane.
  - Match its launch timestamp to Sentry breadcrumbs (category = "rn.init").
  - Pair it with the dSYM uploaded for that build to symbolicate the React frames.

If the simulator is running but the file is missing:
  - The crash may have happened before installHandlers() ran. Check NSLog stream above.
EOF
  exit 1
fi
