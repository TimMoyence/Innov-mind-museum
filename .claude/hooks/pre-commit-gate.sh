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

# 4. Stryker incremental (smart skip — only if a mutate-list file is staged)
STAGED_BE_TS=$(git diff --cached --name-only --diff-filter=d 2>/dev/null | grep '^museum-backend/src/.*\.ts$' || true)
if [ -n "$STAGED_BE_TS" ]; then
  # Extract mutate list (positive entries only) from stryker.config.mjs
  MUTATE_PATHS=$(node -e '
    import("./museum-backend/stryker.config.mjs").then((m) => {
      const cfg = m.default;
      console.log((cfg.mutate ?? []).filter((p) => !p.startsWith("!")).join("\n"));
    }).catch((e) => { process.stderr.write(e.message); process.exit(1); });
  ' 2>/dev/null)

  if [ -n "$MUTATE_PATHS" ]; then
    STAGED_RELATIVE=$(echo "$STAGED_BE_TS" | sed 's|^museum-backend/||')
    STAGED_MUTATE=$(echo "$STAGED_RELATIVE" | grep -Fxf <(echo "$MUTATE_PATHS") || true)

    if [ -n "$STAGED_MUTATE" ]; then
      echo "[stryker] mutate-list files touched — running incremental:"
      echo "$STAGED_MUTATE" | sed 's/^/  /'
      if ! (cd "$REPO_ROOT/museum-backend" && pnpm run mutation:ci 2>&1 | tail -20); then
        ERRORS="${ERRORS}Stryker incremental FAIL. "
      else
        if ! (cd "$REPO_ROOT/museum-backend" && pnpm run mutation:gate 2>&1 | tail -20); then
          ERRORS="${ERRORS}Stryker hot-files gate FAIL (kill ratio < threshold on a hot file). "
        fi
      fi
    fi
  fi
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
