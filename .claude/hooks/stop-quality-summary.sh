#!/bin/bash
# Stop — session quality delta summary
# Outputs text summary of quality metrics at session end

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"

# Quick metrics
TEST_OUTPUT=$(cd "$REPO_ROOT/museum-backend" && pnpm test 2>&1)
TEST_PASSED=$(echo "$TEST_OUTPUT" | grep "^Tests:" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' 2>/dev/null || echo "?")
TEST_FAILED=$(echo "$TEST_OUTPUT" | grep "^Tests:" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' 2>/dev/null || echo "0")

TS_ERRORS=$(cd "$REPO_ROOT/museum-backend" && npx tsc --noEmit 2>&1 | grep -c "error TS" 2>/dev/null || echo "0")

AS_ANY=$(grep -rc "as any" "$REPO_ROOT/museum-backend/tests/" --include="*.ts" 2>/dev/null | awk -F: '{sum+=$2} END{print sum+0}' || echo "?")

echo "Session end: tests=${TEST_PASSED} passed, ${TEST_FAILED} failed | tsc-errors=$TS_ERRORS | as-any=$AS_ANY"
