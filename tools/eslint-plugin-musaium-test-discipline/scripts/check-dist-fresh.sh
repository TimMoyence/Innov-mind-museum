#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cd "$ROOT_DIR"
./node_modules/.bin/tsc -p tsconfig.json --outDir "$TMP/dist"
if ! diff -r "$TMP/dist" dist >/dev/null 2>&1; then
  echo "FAIL: tools/eslint-plugin-musaium-test-discipline/dist is stale; run 'pnpm build' in that dir and commit." >&2
  diff -r "$TMP/dist" dist >&2 || true
  exit 1
fi
echo "OK: plugin dist is fresh"
