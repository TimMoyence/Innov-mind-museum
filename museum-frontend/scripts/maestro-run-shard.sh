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
elif [ "$SHARD" = "smoke" ]; then
  # Per-PR fast subset: a handful of proven-green critical happy paths run on a
  # single emulator boot (~12min). The full per-shard suite runs nightly. The
  # `smoke` list lives OUTSIDE `.shards[]` so its flows (which are also in the
  # `auth` shard) don't trip the shard-manifest dedup sentinel.
  FLOWS=$(jq -r '.smoke[]' "$MAESTRO_DIR/shards.json")
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

# Each flow gets one retry before being marked FAIL. Maestro flows on a CI
# emulator have a transient-flake floor (deep-link mount timing, a dropped first
# tap right after boot, animation races) that a single re-run clears. Only
# failures retry, so green flows pay nothing; a genuinely-broken flow runs twice
# (acceptable — the guard rail must not go red on a one-off flake).
MAX_ATTEMPTS="${MAESTRO_FLOW_ATTEMPTS:-2}"

while IFS= read -r flow; do
  [ -z "$flow" ] && continue
  attempt=1
  passed=0
  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    echo "[shard:$SHARD] running $flow (attempt $attempt/$MAX_ATTEMPTS)…"
    # `--debug-output` writes the per-flow view hierarchy + screenshots into
    # logs/debug/<flow>/, captured by the CI "Upload shard logs" artifact — it
    # shows the exact screen the app was on when an assertion failed.
    if maestro test --debug-output "$LOG_DIR/debug/${flow%.yaml}" "$MAESTRO_DIR/$flow" 2>&1 | tee "$LOG_DIR/${SHARD}-${flow%.yaml}.log"; then
      passed=1
      break
    fi
    echo "[shard:$SHARD] $flow attempt $attempt failed"
    attempt=$((attempt + 1))
  done
  if [ "$passed" -eq 1 ]; then
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
