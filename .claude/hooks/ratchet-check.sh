#!/bin/bash
# Quality Ratchet — compare current metrics vs baseline in quality-ratchet.json
# Exit 0 if OK (no regression), exit 1 if regression detected
# Write-on-improve: updates baseline if any metric improves

set -euo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
RATCHET_FILE="$REPO_ROOT/.claude/quality-ratchet.json"

if [ ! -f "$RATCHET_FILE" ]; then
  echo "No ratchet baseline found — skipping"
  exit 0
fi

# Check jq is available
if ! command -v jq &>/dev/null; then
  echo "jq not found — skipping ratchet check"
  exit 0
fi

# Read baseline
BASELINE_TESTS=$(jq -r '.testCount // 0' "$RATCHET_FILE")
BASELINE_TS_ERRORS=$(jq -r '.typecheckErrors // 0' "$RATCHET_FILE")
BASELINE_AS_ANY=$(jq -r '.asAnyCount // 0' "$RATCHET_FILE")

# Measure current metrics
CURRENT_TESTS=$(cd "$REPO_ROOT/museum-backend" && pnpm test 2>&1 | grep "^Tests:" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
if [ -z "$CURRENT_TESTS" ]; then CURRENT_TESTS=0; fi

CURRENT_TS_ERRORS=$(cd "$REPO_ROOT/museum-backend" && { npx tsc --noEmit 2>&1 | grep -c "error TS" || true; })
if [ -z "$CURRENT_TS_ERRORS" ]; then CURRENT_TS_ERRORS=0; fi

CURRENT_AS_ANY=$( { grep -r "as any" "$REPO_ROOT/museum-backend/tests/" --include="*.ts" 2>/dev/null || true; } | wc -l | tr -d ' ')
if [ -z "$CURRENT_AS_ANY" ]; then CURRENT_AS_ANY=0; fi

REGRESSION=false
IMPROVED=false
DETAILS=""

# Test count must not decrease
if [ "$CURRENT_TESTS" -lt "$BASELINE_TESTS" ] 2>/dev/null; then
  REGRESSION=true
  DETAILS="${DETAILS}testCount: $BASELINE_TESTS → $CURRENT_TESTS (↓). "
elif [ "$CURRENT_TESTS" -gt "$BASELINE_TESTS" ] 2>/dev/null; then
  IMPROVED=true
fi

# Typecheck errors must not increase
if [ "$CURRENT_TS_ERRORS" -gt "$BASELINE_TS_ERRORS" ] 2>/dev/null; then
  REGRESSION=true
  DETAILS="${DETAILS}typecheckErrors: $BASELINE_TS_ERRORS → $CURRENT_TS_ERRORS (↑). "
elif [ "$CURRENT_TS_ERRORS" -lt "$BASELINE_TS_ERRORS" ] 2>/dev/null; then
  IMPROVED=true
fi

# as any count must not increase
if [ "$CURRENT_AS_ANY" -gt "$BASELINE_AS_ANY" ] 2>/dev/null; then
  REGRESSION=true
  DETAILS="${DETAILS}asAnyCount: $BASELINE_AS_ANY → $CURRENT_AS_ANY (↑). "
elif [ "$CURRENT_AS_ANY" -lt "$BASELINE_AS_ANY" ] 2>/dev/null; then
  IMPROVED=true
fi

# Frontend test count ratchet
FE_TEST_OUTPUT=$(cd "$REPO_ROOT/museum-frontend" && npm test 2>&1 | grep -E 'Tests:' | grep -oE '[0-9]+ passed' | head -1)
FE_CURRENT_TESTS=$(echo "$FE_TEST_OUTPUT" | grep -oE '[0-9]+' | head -1)
FE_BASELINE=$(jq -r '.frontendTestCount // 0' "$RATCHET_FILE")
if [ -n "$FE_CURRENT_TESTS" ] && [ "$FE_CURRENT_TESTS" -lt "$FE_BASELINE" ] 2>/dev/null; then
  echo "RATCHET REGRESSION: Frontend tests $FE_CURRENT_TESTS < baseline $FE_BASELINE"
  REGRESSION=true
fi
if [ -n "$FE_CURRENT_TESTS" ] && [ "$FE_CURRENT_TESTS" -gt "$FE_BASELINE" ] 2>/dev/null; then
  jq --argjson v "$FE_CURRENT_TESTS" '.frontendTestCount = $v' "$RATCHET_FILE" > "$RATCHET_FILE.tmp" && mv "$RATCHET_FILE.tmp" "$RATCHET_FILE"
  echo "Ratchet improved: frontend tests $FE_BASELINE -> $FE_CURRENT_TESTS"
fi

# Web test count ratchet
# vitest prints "Test Files N passed" BEFORE "Tests N passed"; the file line would
# match first and mis-report a regression, so we anchor on the "Tests" line only.
WEB_TEST_OUTPUT=$(cd "$REPO_ROOT/museum-web" && pnpm test 2>&1 | grep -E '^[[:space:]]*Tests[[:space:]]+[0-9]+ passed' | grep -oE '[0-9]+ passed' | head -1 || true)
WEB_CURRENT_TESTS=$(echo "$WEB_TEST_OUTPUT" | grep -oE '[0-9]+' | head -1)
WEB_BASELINE=$(jq -r '.webTestCount // 0' "$RATCHET_FILE")
if [ -n "$WEB_CURRENT_TESTS" ] && [ "$WEB_CURRENT_TESTS" -lt "$WEB_BASELINE" ] 2>/dev/null; then
  echo "RATCHET REGRESSION: Web tests $WEB_CURRENT_TESTS < baseline $WEB_BASELINE"
  REGRESSION=true
fi
if [ -n "$WEB_CURRENT_TESTS" ] && [ "$WEB_CURRENT_TESTS" -gt "$WEB_BASELINE" ] 2>/dev/null; then
  jq --argjson v "$WEB_CURRENT_TESTS" '.webTestCount = $v' "$RATCHET_FILE" > "$RATCHET_FILE.tmp" && mv "$RATCHET_FILE.tmp" "$RATCHET_FILE"
  echo "Ratchet improved: web tests $WEB_BASELINE -> $WEB_CURRENT_TESTS"
fi

if $REGRESSION; then
  echo "RATCHET REGRESSION: $DETAILS"
  exit 1
fi

# Write-on-improve: update baseline if any metric improved
if $IMPROVED; then
  DATE=$(date -u +"%Y-%m-%d")
  jq --argjson tests "$CURRENT_TESTS" \
     --argjson tsErrors "$CURRENT_TS_ERRORS" \
     --argjson asAny "$CURRENT_AS_ANY" \
     --arg date "$DATE" \
     '.testCount = $tests | .typecheckErrors = $tsErrors | .asAnyCount = $asAny | .lastUpdated = $date' \
     "$RATCHET_FILE" > "${RATCHET_FILE}.tmp" && mv "${RATCHET_FILE}.tmp" "$RATCHET_FILE"
  echo "RATCHET IMPROVED: tests=$CURRENT_TESTS tsErrors=$CURRENT_TS_ERRORS asAny=$CURRENT_AS_ANY"
fi

# Commit size check (warning only, never blocks)
STAGED_INSERTIONS=$(git diff --cached --stat 2>/dev/null | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || true)
if [ -n "$STAGED_INSERTIONS" ] && [ "$STAGED_INSERTIONS" -gt 2000 ] 2>/dev/null; then
  echo "COMMIT SIZE WARNING: $STAGED_INSERTIONS insertions > 2000 recommended max"
elif [ -n "$STAGED_INSERTIONS" ] && [ "$STAGED_INSERTIONS" -gt 500 ] 2>/dev/null; then
  echo "COMMIT SIZE WARNING: $STAGED_INSERTIONS insertions > 500 recommended max"
fi

exit 0
