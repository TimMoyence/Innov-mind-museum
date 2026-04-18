#!/bin/bash
# PreToolUse: Bash — intercept git commit, run fast quality gate pipeline
# Outputs JSON {"decision":"block","reason":"..."} to block the commit if quality fails
#
# Ratchet check moved to Stop hook (see .claude/settings.local.json) — runs full
# test suites at session end, not on every commit. Rationale: ratchet takes 4–5 min
# to run BE (2700+ tests) + FE (1120) + web (174) which exceeds pre-commit timeout
# and would also timeout in CI. Pre-commit stays fast; ratchet stays recurring.

set -euo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"

# Read hook input from stdin
INPUT=$(cat)

# Extract the command being executed
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only intercept git commit commands (not git add, git push, etc.)
if ! echo "$COMMAND" | grep -qE '^\s*git\s+commit'; then
  exit 0
fi

ERRORS=""

# 1. Typecheck backend
if ! (cd "$REPO_ROOT/museum-backend" && npx tsc --noEmit &>/dev/null); then
  ERRORS="${ERRORS}Backend typecheck FAIL. "
fi

# 2. Typecheck frontend (quick check)
if ! (cd "$REPO_ROOT/museum-frontend" && npx tsc --noEmit &>/dev/null); then
  ERRORS="${ERRORS}Frontend typecheck FAIL. "
fi

# 3. ESLint on staged TS/TSX files
STAGED_TS=$(git diff --cached --name-only --diff-filter=d -- '*.ts' '*.tsx' 2>/dev/null)
if [ -n "$STAGED_TS" ]; then
  npx eslint $STAGED_TS --max-warnings=0 2>/dev/null || { echo "ESLint errors on staged files"; ERRORS="${ERRORS}ESLint staged files FAIL. "; }
fi

# 4. Tests backend (bail on first failure for speed, only changed files)
if ! (cd "$REPO_ROOT/museum-backend" && pnpm test -- --bail --changedSince=HEAD --coverage=false &>/dev/null); then
  ERRORS="${ERRORS}Backend tests FAIL. "
fi

# If any errors, block the commit
if [ -n "$ERRORS" ]; then
  # Escape for JSON
  ESCAPED_ERRORS=$(echo "$ERRORS" | sed 's/"/\\"/g' | tr '\n' ' ')
  echo "{\"decision\": \"block\", \"reason\": \"Pre-commit gate FAILED: ${ESCAPED_ERRORS}\"}"
  exit 0
fi

# All clear — allow the commit
exit 0
