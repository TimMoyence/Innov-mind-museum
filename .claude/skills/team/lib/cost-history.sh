#!/usr/bin/env bash
# cost-history.sh — append a {estimated,actual,delta} entry to cost-history.json
# atomically (mkdir lock pattern, same as state.json hooks).
# T1.1 ROADMAP_TEAM (KR1).
#
# Usage:
#   cost-history.sh <run_id> <mode> <pipeline> <estimated_json> <actual_json>
#
# Args:
#   estimated_json — raw stdout of cost-estimate.sh (JSON, single line).
#   actual_json    — raw stdout of cost-aggregate.sh (JSON, single line).
#
# Output: appends to .claude/skills/team/team-state/cost-history.json
# Exit:
#   0 OK
#   1 invalid args / lock timeout / jq missing

set -euo pipefail

RUN_ID="${1:-}"
MODE="${2:-}"
PIPELINE="${3:-}"
ESTIMATED_JSON="${4:-}"
ACTUAL_JSON="${5:-}"

if [ -z "$RUN_ID" ] || [ -z "$MODE" ] || [ -z "$PIPELINE" ] \
   || [ -z "$ESTIMATED_JSON" ] || [ -z "$ACTUAL_JSON" ]; then
  echo "usage: cost-history.sh <run_id> <mode> <pipeline> <estimated_json> <actual_json>" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq required" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
HISTORY_FILE="$REPO_ROOT/.claude/skills/team/team-state/cost-history.json"
LOCK_DIR="$HISTORY_FILE.lock.d"

# Initialize empty array if missing.
[ -f "$HISTORY_FILE" ] || echo '[]' > "$HISTORY_FILE"

# CAS lock — same mkdir pattern as state.json hooks (POSIX atomic).
acquire_lock() {
  local timeout_s=3 elapsed=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    if [ -f "$LOCK_DIR/pid" ]; then
      local pid; pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
        rm -rf "$LOCK_DIR"
        continue
      fi
    fi
    elapsed=$((elapsed + 1))
    [ "$elapsed" -ge "$timeout_s" ] && return 1
    sleep 1
  done
  echo "$$" > "$LOCK_DIR/pid"
  return 0
}
release_lock() { rm -rf "$LOCK_DIR"; }

if ! acquire_lock; then
  echo "cost-history: lock timeout after 3s" >&2
  exit 1
fi
trap release_lock EXIT

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Compute delta.
est_cost=$(echo "$ESTIMATED_JSON" | jq -r '.totalCostUSD // 0')
act_cost=$(echo "$ACTUAL_JSON"    | jq -r '.costUSD // 0')

# Skip delta when actual == 0 (no telemetry collected — partial run).
if [ "$act_cost" = "0" ] || [ "$act_cost" = "0.0000" ]; then
  delta="0"
  delta_pct="null"
else
  delta=$(LC_ALL=C awk -v a="$act_cost" -v e="$est_cost" 'BEGIN{ printf("%.4f", a-e) }')
  delta_pct=$(LC_ALL=C awk -v a="$act_cost" -v e="$est_cost" \
              'BEGIN{ if (e==0) print "null"; else printf("%.2f", ((a-e)/e)*100) }')
fi

entry=$(jq -nc \
  --arg runId "$RUN_ID" \
  --arg ts "$ts" \
  --arg mode "$MODE" \
  --arg pipeline "$PIPELINE" \
  --argjson estimated "$ESTIMATED_JSON" \
  --argjson actual "$ACTUAL_JSON" \
  --argjson delta "$delta" \
  --argjson deltaPct "$delta_pct" \
  '{ runId: $runId, ts: $ts, mode: $mode, pipeline: $pipeline,
     estimated: $estimated, actual: $actual,
     delta: $delta, deltaPct: $deltaPct }')

# Append + truncate to last 200 entries (keep file bounded).
new_history=$(jq --argjson e "$entry" '. += [$e] | (if length > 200 then .[-200:] else . end)' "$HISTORY_FILE")
echo "$new_history" > "$HISTORY_FILE"

echo "$entry"
