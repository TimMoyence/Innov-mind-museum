#!/bin/bash
# bg-quality-runner.sh
# Heavy quality measurement, detached background. Single-instance via mkdir lock (atomic, no TOCTOU).
# Writes JSON cache + appends regression alerts. NEVER blocks Stop hooks.
#
# Inputs:
#   BG_RUN_TESTS=0  — skip running test suites (typecheck + as-any only)
#   BG_RUN_BE=0     — skip backend tests
#   BG_RUN_FE=0     — skip frontend tests
#   BG_RUN_WEB=0    — skip web tests
#   BG_TIMEOUT_SEC  — per-suite timeout (default 600)
#
# Outputs:
#   .claude/.cache/quality.json   — latest measurements (counts: -1 = "not measured", >=0 = real)
#   .claude/.cache/alerts.log     — append-only regression log
#   .claude/.cache/bg-runner.log  — runner timing trace
#   .claude/.cache/.failed-*.out  — preserved test output on non-zero exit (for forensics)

set -uo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
CACHE_DIR="$REPO_ROOT/.claude/.cache"
CACHE_FILE="$CACHE_DIR/quality.json"
LOCK_DIR="$CACHE_DIR/quality.lock.d"
ALERTS_FILE="$CACHE_DIR/alerts.log"
LOG_FILE="$CACHE_DIR/bg-runner.log"
RATCHET_FILE="$REPO_ROOT/.claude/quality-ratchet.json"

mkdir -p "$CACHE_DIR"

# Single instance — mkdir is atomic on POSIX. No TOCTOU window.
# Stale-lock recovery: if lock dir owner PID is gone, reclaim.
acquire_lock() {
  local owner_file="$LOCK_DIR/owner"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$owner_file"
    return 0
  fi
  # Lock dir exists — check owner
  if [ -f "$owner_file" ]; then
    local owner_pid
    owner_pid=$(cat "$owner_file" 2>/dev/null || echo "")
    if [ -n "$owner_pid" ] && ! kill -0 "$owner_pid" 2>/dev/null; then
      # Stale — reclaim
      rm -rf "$LOCK_DIR"
      if mkdir "$LOCK_DIR" 2>/dev/null; then
        echo $$ > "$owner_file"
        return 0
      fi
    fi
  fi
  return 1
}
if ! acquire_lock; then
  exit 0
fi

START_TS=$(date +%s)
TS_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Cleanup trap: release lock + truncate log even on crash/kill.
cleanup() {
  if [ -f "$LOG_FILE" ]; then
    tail -n 200 "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE"
  fi
  rm -rf "$LOCK_DIR"
}
trap cleanup EXIT INT TERM

echo "[$TS_ISO] bg-runner start (pid=$$)" >> "$LOG_FILE"

# jq is required for cache + ratchet. Without it, ratchet would silently
# baseline=0 and miss every regression — so warn loud and exit.
if ! command -v jq &>/dev/null; then
  echo "[$TS_ISO] WARN: jq not installed — quality cache disabled. Install via 'brew install jq'." >> "$LOG_FILE"
  echo "[$TS_ISO] WARN: jq missing" >> "$ALERTS_FILE"
  exit 0
fi

BE_DIR="$REPO_ROOT/museum-backend"
FE_DIR="$REPO_ROOT/museum-frontend"
WEB_DIR="$REPO_ROOT/museum-web"

RUN_TESTS="${BG_RUN_TESTS:-1}"
RUN_BE="${BG_RUN_BE:-1}"
RUN_FE="${BG_RUN_FE:-1}"
RUN_WEB="${BG_RUN_WEB:-1}"
TIMEOUT_SEC="${BG_TIMEOUT_SEC:-600}"

# Pick a timeout helper. macOS lacks `timeout`; brew installs `gtimeout`.
# If neither, run uncapped (and document).
TIMEOUT_BIN=""
if command -v timeout &>/dev/null; then
  TIMEOUT_BIN="timeout $TIMEOUT_SEC"
elif command -v gtimeout &>/dev/null; then
  TIMEOUT_BIN="gtimeout $TIMEOUT_SEC"
fi
if [ -z "$TIMEOUT_BIN" ]; then
  echo "[$TS_ISO] WARN: no 'timeout' or 'gtimeout' — test suites run uncapped. brew install coreutils." >> "$LOG_FILE"
fi

# --- Backend typecheck (always, fast ~10s) ---
TSC_ERRORS=0
if [ -d "$BE_DIR" ]; then
  TSC_OUT=$(cd "$BE_DIR" && $TIMEOUT_BIN npx tsc --noEmit 2>&1 || true)
  TSC_ERRORS=$(echo "$TSC_OUT" | grep -c "error TS" || true)
  [ -z "$TSC_ERRORS" ] && TSC_ERRORS=0
fi

# --- as-any count (BE test files) ---
# Match `as any` only when followed by a TypeScript-cast char (`)` `;` `,` `.` whitespace).
# Excludes prose like "`as any` callers".
AS_ANY=0
if [ -d "$BE_DIR/tests" ]; then
  AS_ANY=$( { grep -rE 'as any[);,.[:space:]]' "$BE_DIR/tests/" --include="*.ts" 2>/dev/null || true; } | wc -l | tr -d ' ')
  [ -z "$AS_ANY" ] && AS_ANY=0
fi

# --- Tests (parallel) ---
# Sentinel value -1 = "not measured" (so the regression check can distinguish from "0 passing").
BE_TESTS=-1
FE_TESTS=-1
WEB_TESTS=-1

# Extract test count from a Jest/Vitest log. Returns -1 if no "X passed" line found.
# Handles formats:
#   Jest:    "Tests:       4 failed, 12 passed, 16 total"
#   Vitest:  "Tests  4 passed | 1 failed (5)"
#   Vitest:  "Tests  5 passed (5)"
extract_passed_count() {
  local log_file="$1"
  local kind="$2"  # jest | vitest
  [ ! -f "$log_file" ] && echo "-1" && return

  local count
  if [ "$kind" = "jest" ]; then
    count=$(grep -E '^Tests:' "$log_file" 2>/dev/null | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | head -1)
  else
    # Vitest: anchor on word "Tests" (NOT "Test Files"), then any whitespace, then capture passed count
    count=$(grep -E '^[[:space:]]*Tests[[:space:]]+[0-9]+ passed( |$|\|)' "$log_file" 2>/dev/null | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+')
    if [ -z "$count" ]; then
      # Vitest with failures: "Tests  4 passed | 1 failed" — count appears after "Tests  "
      count=$(grep -E '^[[:space:]]*Tests[[:space:]]' "$log_file" 2>/dev/null | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+')
    fi
  fi
  if [ -z "$count" ]; then
    echo "-1"
  else
    echo "$count"
  fi
}

if [ "$RUN_TESTS" = "1" ]; then
  BE_LOG="$CACHE_DIR/.be-test.out"
  FE_LOG="$CACHE_DIR/.fe-test.out"
  WEB_LOG="$CACHE_DIR/.web-test.out"

  BE_PID=""
  FE_PID=""
  WEB_PID=""
  BE_RC=0
  FE_RC=0
  WEB_RC=0

  if [ "$RUN_BE" = "1" ] && [ -d "$BE_DIR" ]; then
    ( cd "$BE_DIR" && $TIMEOUT_BIN pnpm test > "$BE_LOG" 2>&1 ) &
    BE_PID=$!
  fi
  if [ "$RUN_FE" = "1" ] && [ -d "$FE_DIR" ]; then
    ( cd "$FE_DIR" && $TIMEOUT_BIN npm test > "$FE_LOG" 2>&1 ) &
    FE_PID=$!
  fi
  if [ "$RUN_WEB" = "1" ] && [ -d "$WEB_DIR" ]; then
    ( cd "$WEB_DIR" && $TIMEOUT_BIN pnpm test > "$WEB_LOG" 2>&1 ) &
    WEB_PID=$!
  fi

  if [ -n "$BE_PID" ]; then wait "$BE_PID" 2>/dev/null; BE_RC=$?; fi
  if [ -n "$FE_PID" ]; then wait "$FE_PID" 2>/dev/null; FE_RC=$?; fi
  if [ -n "$WEB_PID" ]; then wait "$WEB_PID" 2>/dev/null; WEB_RC=$?; fi

  BE_TESTS=$(extract_passed_count "$BE_LOG" "jest")
  FE_TESTS=$(extract_passed_count "$FE_LOG" "jest")
  WEB_TESTS=$(extract_passed_count "$WEB_LOG" "vitest")

  # Preserve logs on non-zero exit. Otherwise discard (no forensics needed for green runs).
  if [ "$BE_RC" -ne 0 ] && [ -f "$BE_LOG" ]; then mv "$BE_LOG" "$CACHE_DIR/.failed-be-$START_TS.out"; else rm -f "$BE_LOG"; fi
  if [ "$FE_RC" -ne 0 ] && [ -f "$FE_LOG" ]; then mv "$FE_LOG" "$CACHE_DIR/.failed-fe-$START_TS.out"; else rm -f "$FE_LOG"; fi
  if [ "$WEB_RC" -ne 0 ] && [ -f "$WEB_LOG" ]; then mv "$WEB_LOG" "$CACHE_DIR/.failed-web-$START_TS.out"; else rm -f "$WEB_LOG"; fi
fi

# --- Baseline read (single jq invocation, batched) ---
BL_BE=0; BL_FE=0; BL_WEB=0; BL_TSC=0; BL_ANY=0
if [ -f "$RATCHET_FILE" ]; then
  read -r BL_BE BL_FE BL_WEB BL_TSC BL_ANY < <(jq -r '"\(.testCount // 0) \(.frontendTestCount // 0) \(.webTestCount // 0) \(.typecheckErrors // 0) \(.asAnyCount // 0)"' "$RATCHET_FILE" 2>/dev/null || echo "0 0 0 0 0")
fi

# Regression detection. -1 means "not measured" — never flag as regression.
REGRESSIONS=""
if [ "$BE_TESTS" -ge 0 ] && [ "$BE_TESTS" -lt "$BL_BE" ] 2>/dev/null; then
  REGRESSIONS+="BE-tests $BL_BE->$BE_TESTS; "
fi
if [ "$FE_TESTS" -ge 0 ] && [ "$FE_TESTS" -lt "$BL_FE" ] 2>/dev/null; then
  REGRESSIONS+="FE-tests $BL_FE->$FE_TESTS; "
fi
if [ "$WEB_TESTS" -ge 0 ] && [ "$WEB_TESTS" -lt "$BL_WEB" ] 2>/dev/null; then
  REGRESSIONS+="WEB-tests $BL_WEB->$WEB_TESTS; "
fi
if [ "$TSC_ERRORS" -gt "$BL_TSC" ] 2>/dev/null; then
  REGRESSIONS+="tsc $BL_TSC->$TSC_ERRORS; "
fi
if [ "$AS_ANY" -gt "$BL_ANY" ] 2>/dev/null; then
  REGRESSIONS+="as-any $BL_ANY->$AS_ANY; "
fi

# Also flag test-runner failures even when count looks fine (e.g. Jest exited non-zero
# but still printed "X passed").
if [ "${BE_RC:-0}" -ne 0 ]; then REGRESSIONS+="BE-suite-rc=$BE_RC; "; fi
if [ "${FE_RC:-0}" -ne 0 ]; then REGRESSIONS+="FE-suite-rc=$FE_RC; "; fi
if [ "${WEB_RC:-0}" -ne 0 ]; then REGRESSIONS+="WEB-suite-rc=$WEB_RC; "; fi

ELAPSED=$(($(date +%s) - START_TS))
DONE_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$CACHE_FILE.tmp" <<EOF
{
  "ts": "$DONE_TS",
  "elapsed_sec": $ELAPSED,
  "backend":  { "tests": $BE_TESTS,  "tsc_errors": $TSC_ERRORS, "as_any": $AS_ANY, "baseline_tests": $BL_BE, "rc": ${BE_RC:-0} },
  "frontend": { "tests": $FE_TESTS,  "baseline_tests": $BL_FE,  "rc": ${FE_RC:-0} },
  "web":      { "tests": $WEB_TESTS, "baseline_tests": $BL_WEB, "rc": ${WEB_RC:-0} },
  "regressions": "$REGRESSIONS"
}
EOF
mv "$CACHE_FILE.tmp" "$CACHE_FILE"

if [ -n "$REGRESSIONS" ]; then
  echo "[$DONE_TS] REGRESSION: $REGRESSIONS" >> "$ALERTS_FILE"
fi

echo "[$DONE_TS] bg-runner done in ${ELAPSED}s (BE=$BE_TESTS FE=$FE_TESTS WEB=$WEB_TESTS tsc=$TSC_ERRORS as-any=$AS_ANY rc=${BE_RC:-0}/${FE_RC:-0}/${WEB_RC:-0})" >> "$LOG_FILE"

exit 0
