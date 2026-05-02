#!/bin/bash
# Stop hook — surface unread regression alerts written by bg-quality-runner.
# Display-only. Never runs tests itself.
#
# Reads .claude/.cache/alerts.log (append-only by bg-runner).
# Tracks read-watermark in .claude/.cache/alerts.seen.
# Detects external truncation/rotation: if TOTAL < SEEN, reset SEEN to 0.

set -uo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
ALERTS="$REPO_ROOT/.claude/.cache/alerts.log"
SEEN="$REPO_ROOT/.claude/.cache/alerts.seen"

[ ! -f "$ALERTS" ] && exit 0

TOTAL=$(wc -l < "$ALERTS" 2>/dev/null | tr -d ' ')
[ -z "$TOTAL" ] && TOTAL=0

SEEN_LINES=0
if [ -f "$SEEN" ]; then
  SEEN_LINES=$(cat "$SEEN" 2>/dev/null || echo 0)
  [ -z "$SEEN_LINES" ] && SEEN_LINES=0
fi

# Rewind detection — alerts.log was truncated/rotated externally.
# Without this, watermark stays high and silently swallows new alerts forever.
if [ "$TOTAL" -lt "$SEEN_LINES" ] 2>/dev/null; then
  SEEN_LINES=0
fi

if [ "$TOTAL" -gt "$SEEN_LINES" ] 2>/dev/null; then
  NEW=$((TOTAL - SEEN_LINES))
  echo "RATCHET: $NEW new regression alert(s):"
  tail -n "$NEW" "$ALERTS"
  echo "$TOTAL" > "$SEEN"
fi

# Commit size warning (cheap — bounded git stat call).
STAGED_INSERTIONS=$( { cd "$REPO_ROOT" 2>/dev/null && git diff --cached --stat 2>/dev/null; } | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || true)
if [ -n "$STAGED_INSERTIONS" ] && [ "$STAGED_INSERTIONS" -gt 2000 ] 2>/dev/null; then
  echo "COMMIT SIZE: $STAGED_INSERTIONS insertions > 2000 (split this PR)"
elif [ -n "$STAGED_INSERTIONS" ] && [ "$STAGED_INSERTIONS" -gt 500 ] 2>/dev/null; then
  echo "COMMIT SIZE: $STAGED_INSERTIONS insertions > 500 (consider splitting)"
fi

exit 0
