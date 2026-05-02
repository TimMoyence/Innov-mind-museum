#!/bin/bash
# Stop hook — display quality summary from cache. Spawn bg-runner if cache stale.
# Always cheap (~50ms). Heavy work happens in detached bg-quality-runner.sh.
#
# Cache TTL: 10 min. Spawn skipped if no relevant src file changed since cache.

set -uo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
CACHE_FILE="$REPO_ROOT/.claude/.cache/quality.json"
RUNNER="$REPO_ROOT/.claude/hooks/lib/bg-quality-runner.sh"
CACHE_TTL_SEC=600

# Hard-fail if repo root missing — refuse to run downstream commands in arbitrary CWD.
[ ! -d "$REPO_ROOT" ] && exit 0

# Render -1 sentinel as "?" for human readability.
fmt() { [ "$1" = "-1" ] && echo "?" || echo "$1"; }

# --- Display cached metrics if available ---
if [ -f "$CACHE_FILE" ] && command -v jq &>/dev/null; then
  TS=$(jq -r '.ts // "?"' "$CACHE_FILE" 2>/dev/null || echo "?")
  BE=$(jq -r '.backend.tests // -1' "$CACHE_FILE" 2>/dev/null || echo "-1")
  FE=$(jq -r '.frontend.tests // -1' "$CACHE_FILE" 2>/dev/null || echo "-1")
  WEB=$(jq -r '.web.tests // -1' "$CACHE_FILE" 2>/dev/null || echo "-1")
  TSC=$(jq -r '.backend.tsc_errors // 0' "$CACHE_FILE" 2>/dev/null || echo 0)
  ANY=$(jq -r '.backend.as_any // 0' "$CACHE_FILE" 2>/dev/null || echo 0)
  REG=$(jq -r '.regressions // ""' "$CACHE_FILE" 2>/dev/null || echo "")

  if [ -n "$REG" ] && [ "$REG" != "null" ]; then
    echo "Quality [$TS]: BE=$(fmt "$BE") FE=$(fmt "$FE") WEB=$(fmt "$WEB") tsc=$TSC as-any=$ANY  WARN: $REG"
  else
    echo "Quality [$TS]: BE=$(fmt "$BE") FE=$(fmt "$FE") WEB=$(fmt "$WEB") tsc=$TSC as-any=$ANY"
  fi
fi

# --- Spawn bg-runner if cache stale + relevant src changed ---
[ ! -x "$RUNNER" ] && exit 0

CACHE_AGE=999999
if [ -f "$CACHE_FILE" ]; then
  CACHE_MTIME=$(stat -f %m "$CACHE_FILE" 2>/dev/null || stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)
  CACHE_AGE=$(($(date +%s) - CACHE_MTIME))
fi

if [ "$CACHE_AGE" -lt "$CACHE_TTL_SEC" ]; then
  exit 0
fi

# Skip spawn if no relevant src file changed AND cache exists.
# Hard-fail cd: refuse to run git in arbitrary CWD.
if [ -f "$CACHE_FILE" ]; then
  CHANGED=$( { cd "$REPO_ROOT" || exit 1; git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | sort -u)
  RELEVANT=$(echo "$CHANGED" | grep -E '^(museum-backend|museum-frontend|museum-web)/(src|tests|__tests__|app|features|shared|components|hooks|lib)/' | head -1 || true)
  if [ -z "$RELEVANT" ]; then
    exit 0
  fi
fi

# Detach bg-runner — survives parent (Stop hook) exit + 5s timeout.
nohup "$RUNNER" >/dev/null 2>&1 &
disown $! 2>/dev/null || true

exit 0
