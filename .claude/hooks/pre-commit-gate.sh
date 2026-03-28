#!/bin/bash
# PreToolUse: Bash — intercept git commit, run quality gate pipeline
# Outputs JSON {"decision":"block","reason":"..."} to block the commit if quality fails

set -euo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
RATCHET_SCRIPT="$REPO_ROOT/.claude/hooks/ratchet-check.sh"

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
if ! (cd "$REPO_ROOT/museum-backend" && pnpm test -- --bail --changedSince=HEAD &>/dev/null); then
  ERRORS="${ERRORS}Backend tests FAIL. "
fi

# 5. Ratchet check (if script exists and is executable)
if [ -x "$RATCHET_SCRIPT" ]; then
  RATCHET_RESULT=$("$RATCHET_SCRIPT" 2>&1) || {
    ERRORS="${ERRORS}Quality ratchet: $RATCHET_RESULT. "
  }
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
