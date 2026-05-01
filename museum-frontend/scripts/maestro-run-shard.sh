#!/usr/bin/env bash
# Phase 2 — Run the Maestro flows for a given shard.
#
# Usage: maestro-run-shard.sh <shard_name>
#   <shard_name>: must match a shard.name in .maestro/shards.json (auth | chat | museum | settings | all)
#
# When <shard_name> = "all", runs the iOS-nightly union (all flows in shards[*].flows).
set -euo pipefail

SHARD="${1:?Usage: maestro-run-shard.sh <shard_name>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAESTRO_DIR="$(cd "$SCRIPT_DIR/../.maestro" && pwd)"
LOG_DIR="$MAESTRO_DIR/logs"
mkdir -p "$LOG_DIR"

if ! command -v jq > /dev/null 2>&1; then
  echo "[shard] jq is required — install via brew install jq" >&2
  exit 1
fi
if ! command -v maestro > /dev/null 2>&1; then
  echo "[shard] maestro CLI is required — see https://maestro.mobile.dev/" >&2
  exit 1
fi

if [ "$SHARD" = "all" ]; then
  FLOWS=$(jq -r '.shards[].flows[]' "$MAESTRO_DIR/shards.json")
else
  FLOWS=$(jq -r --arg s "$SHARD" '.shards[] | select(.name == $s) | .flows[]' "$MAESTRO_DIR/shards.json")
fi

if [ -z "$FLOWS" ]; then
  echo "[shard] no flows found for shard '$SHARD' — check shards.json" >&2
  exit 1
fi

FAIL_COUNT=0
echo "[shard:$SHARD] flows to run:"
echo "$FLOWS"

while IFS= read -r flow; do
  [ -z "$flow" ] && continue
  echo "[shard:$SHARD] running $flow…"
  if maestro test "$MAESTRO_DIR/$flow" 2>&1 | tee "$LOG_DIR/${SHARD}-${flow%.yaml}.log"; then
    echo "[shard:$SHARD] $flow PASS"
  else
    echo "[shard:$SHARD] $flow FAIL"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done <<< "$FLOWS"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "[shard:$SHARD] $FAIL_COUNT flow(s) failed."
  exit 1
fi

echo "[shard:$SHARD] all flows passed."
exit 0
