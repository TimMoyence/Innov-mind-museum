#!/bin/bash
# PostToolUse: Edit|Write — auto-format modified files (PE-015)
# Reads hook input from stdin, extracts file path, runs prettier + eslint --fix

set -euo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"

# Read the hook input from stdin
INPUT=$(cat)

# Extract the file path from the tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only process TypeScript/JavaScript/JSON/CSS files
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.mjs)
    ;;
  *)
    exit 0
    ;;
esac

# Skip non-source files (configs, lockfiles, team-knowledge)
case "$FILE_PATH" in
  *node_modules*|*pnpm-lock*|*package-lock*|*.claude/*team-knowledge*|*.claude/*team-reports*)
    exit 0
    ;;
esac

# Check file exists
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# UFR-022 frozen-test: NEVER reformat a test frozen by a /team red phase.
# A silent prettier/eslint --fix would diverge the file's sha256 and mechanically
# bypass post-edit-green-test-freeze.sh. Skip the file if it is listed (absolute or
# repo-relative) in ANY active red-test-manifest.json. RUN_ID-independent on purpose.
REL_PATH="${FILE_PATH#"$REPO_ROOT"/}"
for manifest in "$REPO_ROOT"/.claude/skills/team/team-state/*/red-test-manifest.json; do
  [ -f "$manifest" ] || continue
  if jq -e --arg p "$FILE_PATH" --arg rp "$REL_PATH" 'has($p) or has($rp)' "$manifest" >/dev/null 2>&1; then
    echo "lint-on-edit: $REL_PATH is frozen (red-test-manifest) — skipping format (UFR-022)" >&2
    exit 0
  fi
done

# Determine which subproject
if [[ "$FILE_PATH" == *"museum-backend"* ]]; then
  cd "$REPO_ROOT/museum-backend"
  npx prettier --write "$FILE_PATH" 2>/dev/null || true
  npx eslint --fix "$FILE_PATH" 2>/dev/null || true
elif [[ "$FILE_PATH" == *"museum-frontend"* ]]; then
  cd "$REPO_ROOT/museum-frontend"
  npx prettier --write "$FILE_PATH" 2>/dev/null || true
  npx eslint --fix "$FILE_PATH" 2>/dev/null || true
elif [[ "$FILE_PATH" == *"museum-web"* ]]; then
  cd "$REPO_ROOT/museum-web" 2>/dev/null || exit 0
  npx prettier --write "$FILE_PATH" 2>/dev/null || true
  npx eslint --fix "$FILE_PATH" 2>/dev/null || true
fi

exit 0
