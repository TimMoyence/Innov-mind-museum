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
