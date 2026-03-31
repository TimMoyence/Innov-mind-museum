#!/usr/bin/env bash
# morning-check.sh — Post-sprint verification script
# Run from repo root: ./scripts/morning-check.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/museum-backend"
FRONTEND="$ROOT/museum-frontend"
FAILURES=0

# ── Helpers ──────────────────────────────────────────────────────────
pass() { printf '  \xe2\x9c\x85  %s\n' "$1"; }
fail() { printf '  \xe2\x9d\x8c  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
header() { printf '\n\033[1m=== %s ===\033[0m\n' "$1"; }

# ── 1. Backend Health ────────────────────────────────────────────────
header "Backend Health"

cd "$BACKEND"

if pnpm lint >/dev/null 2>&1; then
  pass "pnpm lint — 0 errors"
else
  fail "pnpm lint — type errors found"
fi

BE_TEST_OUTPUT=$(pnpm test 2>&1) || true
# Jest output: "Tests:  N passed" or "N failed, M passed"
BE_TEST_PASS=$(echo "$BE_TEST_OUTPUT" | sed -n 's/.*Tests:.*[[:space:]]\([0-9][0-9]*\) passed.*/\1/p' | tail -1)
BE_TEST_PASS=${BE_TEST_PASS:-0}
BE_TEST_FAIL=$(echo "$BE_TEST_OUTPUT" | sed -n 's/.*Tests:.*[[:space:]]\([0-9][0-9]*\) failed.*/\1/p' | tail -1)
BE_TEST_FAIL=${BE_TEST_FAIL:-0}

if [ "$BE_TEST_FAIL" -gt 0 ] 2>/dev/null; then
  fail "pnpm test — $BE_TEST_FAIL test(s) failed"
elif [ "$BE_TEST_PASS" -ge 1457 ] 2>/dev/null; then
  pass "pnpm test — $BE_TEST_PASS passed (>= 1457)"
else
  fail "pnpm test — only $BE_TEST_PASS passed (expected >= 1457)"
fi

# ── 2. Frontend Health ───────────────────────────────────────────────
header "Frontend Health"

cd "$FRONTEND"

LINT_OUTPUT=$(npm run lint 2>&1) || true
# tsc output: "N error(s)" / "N warning(s)" — extract last match
LINT_ERRORS=$(echo "$LINT_OUTPUT" | sed -n 's/.*[[:space:]]\([0-9][0-9]*\) error.*/\1/p' | tail -1)
LINT_ERRORS=${LINT_ERRORS:-0}
LINT_WARNINGS=$(echo "$LINT_OUTPUT" | sed -n 's/.*[[:space:]]\([0-9][0-9]*\) warning.*/\1/p' | tail -1)
LINT_WARNINGS=${LINT_WARNINGS:-0}

if [ "${LINT_ERRORS:-0}" -gt 0 ] 2>/dev/null; then
  fail "npm run lint — $LINT_ERRORS error(s)"
elif [ "${LINT_WARNINGS:-0}" -le 22 ] 2>/dev/null; then
  pass "npm run lint — 0 errors, $LINT_WARNINGS warnings (<= 22)"
else
  fail "npm run lint — $LINT_WARNINGS warnings (expected <= 22)"
fi

FE_TEST_OUTPUT=$(npm test 2>&1) || true
# Node.js test runner output: "# pass N" / "# fail N"
FE_TEST_PASS=$(echo "$FE_TEST_OUTPUT" | sed -n 's/^# pass \([0-9][0-9]*\)/\1/p' | tail -1)
FE_TEST_PASS=${FE_TEST_PASS:-0}
FE_TEST_FAIL=$(echo "$FE_TEST_OUTPUT" | sed -n 's/^# fail \([0-9][0-9]*\)/\1/p' | tail -1)
FE_TEST_FAIL=${FE_TEST_FAIL:-0}

if [ "$FE_TEST_FAIL" -gt 0 ] 2>/dev/null; then
  fail "npm test — $FE_TEST_FAIL test(s) failed"
elif [ "$FE_TEST_PASS" -ge 146 ] 2>/dev/null; then
  pass "npm test — $FE_TEST_PASS passed (>= 146)"
else
  fail "npm test — only $FE_TEST_PASS passed (expected >= 146)"
fi

# ── 3. OpenAPI Contract Sync ─────────────────────────────────────────
header "OpenAPI Contract Sync"

cd "$FRONTEND"

if npm run check:openapi-types >/dev/null 2>&1; then
  pass "OpenAPI types in sync with backend spec"
else
  fail "OpenAPI types out of sync — run: npm run generate:openapi-types"
fi

# ── 4. iOS Build Integrity ───────────────────────────────────────────
header "iOS Build Integrity"

if [ -d "$FRONTEND/ios" ]; then
  cd "$FRONTEND/ios"

  if [ -f Podfile.lock ] && [ -f Pods/Manifest.lock ]; then
    if diff -q Podfile.lock Pods/Manifest.lock >/dev/null 2>&1; then
      pass "Podfile.lock matches Pods/Manifest.lock"
    else
      fail "Podfile.lock differs from Pods/Manifest.lock — run: cd ios && pod install"
    fi
  else
    fail "Podfile.lock or Pods/Manifest.lock missing"
  fi

  UNTRACKED_PODS=$(cd "$ROOT" && git ls-files --others --exclude-standard museum-frontend/ios/Pods/ 2>/dev/null | head -5)
  if [ -z "$UNTRACKED_PODS" ]; then
    pass "No untracked Pods files"
  else
    fail "Untracked Pods files found (first 5):\n$UNTRACKED_PODS"
  fi
else
  fail "ios/ directory not found"
fi

# ── 5. Git Status ────────────────────────────────────────────────────
header "Git Status"

cd "$ROOT"

DIRTY=$(git status --porcelain 2>/dev/null | grep -v '^??' || true)
if [ -z "$DIRTY" ]; then
  pass "Working tree clean (no uncommitted changes)"
else
  DIRTY_COUNT=$(echo "$DIRTY" | wc -l | tr -d ' ')
  fail "$DIRTY_COUNT uncommitted change(s):\n$DIRTY"
fi

SENSITIVE=$(git ls-files --others --cached --exclude-standard 2>/dev/null \
  | grep -iE '\.(env|pem|key|p12|credentials|secret)$' \
  | grep -v '\.example$' \
  | grep -v '\.env\.local\.example$' || true)
if [ -z "$SENSITIVE" ]; then
  pass "No sensitive files tracked"
else
  fail "Sensitive files tracked in git:\n$SENSITIVE"
fi

# ── 6. Quality Ratchet ───────────────────────────────────────────────
header "Quality Ratchet"

cd "$ROOT"

# 'as any' in source (excluding tests, node_modules, generated)
BE_AS_ANY=$(grep -r 'as any' museum-backend/src/ --include='*.ts' -l 2>/dev/null | wc -l | tr -d ' ')
FE_AS_ANY=$(grep -r 'as any' museum-frontend/ --include='*.ts' --include='*.tsx' \
  -l --exclude-dir=node_modules --exclude-dir=.test-dist --exclude-dir=__tests__ \
  --exclude-dir=tests --exclude-dir=generated 2>/dev/null | wc -l | tr -d ' ')
TOTAL_AS_ANY=$((BE_AS_ANY + FE_AS_ANY))

if [ "$TOTAL_AS_ANY" -le 1 ]; then
  pass "'as any' in source: $TOTAL_AS_ANY (<= 1)"
else
  fail "'as any' in source: $TOTAL_AS_ANY (expected <= 1)"
fi

# eslint-disable count (backend src + frontend non-test non-generated)
BE_ESLINT=$(grep -r 'eslint-disable' museum-backend/src/ --include='*.ts' -c 2>/dev/null \
  | awk -F: '{s+=$2} END {print s+0}')
FE_ESLINT=$(grep -r 'eslint-disable' museum-frontend/ --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules --exclude-dir=.test-dist --exclude-dir=__tests__ \
  --exclude-dir=tests --exclude-dir=generated -c 2>/dev/null \
  | awk -F: '{s+=$2} END {print s+0}')
TOTAL_ESLINT=$((BE_ESLINT + FE_ESLINT))

# Baselines from 2026-03-31: backend=77, frontend(ts)=36, frontend(tsx)=22 => 135 total
if [ "$TOTAL_ESLINT" -le 135 ]; then
  pass "eslint-disable count: $TOTAL_ESLINT (<= 135 baseline)"
else
  fail "eslint-disable count: $TOTAL_ESLINT (regression from 135 baseline)"
fi

# Test count non-regression summary
if [ "${BE_TEST_PASS:-0}" -ge 1457 ] && [ "${FE_TEST_PASS:-0}" -ge 146 ]; then
  pass "Test counts: backend=$BE_TEST_PASS (>= 1457), frontend=$FE_TEST_PASS (>= 146)"
else
  fail "Test count regression: backend=${BE_TEST_PASS:-?} (need 1457), frontend=${FE_TEST_PASS:-?} (need 146)"
fi

# ── 7. Xcode Cloud / CI Status ──────────────────────────────────────
header "CI Status (GitHub Actions)"

if command -v gh >/dev/null 2>&1; then
  CI_OUTPUT=$(gh run list --limit 3 --json workflowName,status,conclusion 2>&1) || true
  if echo "$CI_OUTPUT" | python3 -c "
import sys, json
runs = json.load(sys.stdin)
all_ok = True
for r in runs:
    name = r.get('workflowName', '?')
    status = r.get('status', '?')
    conclusion = r.get('conclusion', '?')
    if status == 'completed' and conclusion == 'success':
        mark = 'ok'
    elif status == 'in_progress':
        mark = 'running'
    else:
        mark = 'FAIL'
        all_ok = False
    print(f'    {mark}: {name} ({status}/{conclusion})')
sys.exit(0 if all_ok else 1)
" 2>/dev/null; then
    pass "Recent CI runs look good"
  else
    fail "CI failures detected (see above)"
  fi
else
  fail "gh CLI not installed — cannot check CI status"
fi

# ── Summary ──────────────────────────────────────────────────────────
header "Summary"

if [ "$FAILURES" -eq 0 ]; then
  printf '\n  \033[32mAll checks passed.\033[0m\n\n'
  exit 0
else
  printf '\n  \033[31m%d check(s) failed.\033[0m\n\n' "$FAILURES"
  exit 1
fi
