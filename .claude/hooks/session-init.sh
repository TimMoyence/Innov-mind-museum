#!/bin/bash
# SessionStart — quality baseline snapshot
# Outputs text that appears as additionalContext in the conversation

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
RATCHET_FILE="$REPO_ROOT/.claude/quality-ratchet.json"

# Quick typecheck
BE_TSC="PASS"
(cd "$REPO_ROOT/museum-backend" && npx tsc --noEmit 2>/dev/null) || BE_TSC="FAIL"

# Test count (fast — just run and parse)
TEST_COUNT=$(cd "$REPO_ROOT/museum-backend" && pnpm test 2>&1 | grep "^Tests:" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' 2>/dev/null || echo "?")

# as any count — production code only (src/), tests excluded
AS_ANY=$( { grep -r "as any" "$REPO_ROOT/museum-backend/src/" --include="*.ts" 2>/dev/null || true; } | wc -l | tr -d ' ')

STATUS="Session baseline: BE-tsc=$BE_TSC | tests=${TEST_COUNT} passed | as-any=$AS_ANY"

# Compare vs ratchet if available
if [ -f "$RATCHET_FILE" ] && command -v jq &>/dev/null; then
  R_TESTS=$(jq -r '.testCount // "?"' "$RATCHET_FILE")
  R_ASANY=$(jq -r '.asAnyCount // "?"' "$RATCHET_FILE")
  STATUS="$STATUS | ratchet: tests=$R_TESTS, as-any=$R_ASANY"
fi

echo "$STATUS"
