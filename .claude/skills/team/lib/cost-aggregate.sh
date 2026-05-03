#!/usr/bin/env bash
# cost-aggregate.sh — actual cost aggregation for a /team run.
# T1.1 ROADMAP_TEAM (KR1).
#
# Sources, in priority order:
#   1. Langfuse public API (if LANGFUSE_ENABLED=true + creds present + reachable).
#      Sums observations.usage.{input,output}.tokens for traceId=trace-<run_id>.
#   2. Fallback to state.json telemetry.tokensTotalIn/Out — populated by dispatcher
#      from each Agent tool return value.
#   3. If neither populated, returns zeros + source=none (caller decides escalation).
#
# Usage:
#   cost-aggregate.sh <run_id>
#
# Output (stdout, single-line JSON):
#   {"runId":"...","tokensIn":N,"tokensOut":N,"costUSD":N.NN,"source":"langfuse|state-json|none"}
#
# Fail-open: exit 0 always (never blocks dispatcher).

set -uo pipefail

RUN_ID="${1:-}"
if [ -z "$RUN_ID" ]; then
  echo '{"error":"run_id required"}' >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
STATE_FILE="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID/state.json"

if ! command -v jq >/dev/null 2>&1; then
  echo '{"error":"jq missing","source":"none","tokensIn":0,"tokensOut":0,"costUSD":0}'
  exit 0
fi

tokens_in=0
tokens_out=0
cost_usd="0"
source="none"

# --- 1. Langfuse path -----------------------------------------------------
if [ "${LANGFUSE_ENABLED:-false}" = "true" ] \
   && [ -n "${LANGFUSE_PUBLIC_KEY:-}" ] \
   && [ -n "${LANGFUSE_SECRET_KEY:-}" ] \
   && command -v curl >/dev/null 2>&1; then
  host="${LANGFUSE_HOST:-http://localhost:3002}"
  trace_id="trace-$RUN_ID"
  resp=$(curl -fsS -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
              --max-time 3 \
              "$host/api/public/observations?traceId=$trace_id&limit=200" 2>/dev/null || echo '')
  if [ -n "$resp" ]; then
    parsed=$(echo "$resp" | jq -c '
      (.data // [])
      | map({
          ti: (.usage.input // 0),
          to: (.usage.output // 0),
          c:  (.calculatedTotalCost // 0)
        })
      | { ti: (map(.ti) | add // 0),
          to: (map(.to) | add // 0),
          c:  (map(.c)  | add // 0) }
    ' 2>/dev/null || echo '')
    if [ -n "$parsed" ]; then
      lf_in=$(echo "$parsed"  | jq -r '.ti // 0')
      lf_out=$(echo "$parsed" | jq -r '.to // 0')
      lf_cost=$(echo "$parsed"| jq -r '.c  // 0')
      if [ "$lf_in" != "0" ] || [ "$lf_out" != "0" ]; then
        tokens_in="$lf_in"
        tokens_out="$lf_out"
        cost_usd=$(LC_ALL=C printf "%.4f" "$lf_cost")
        source="langfuse"
      fi
    fi
  fi
fi

# --- 2. state.json fallback ----------------------------------------------
if [ "$source" = "none" ] && [ -f "$STATE_FILE" ]; then
  st_in=$(jq -r '.telemetry.tokensTotalIn  // 0' "$STATE_FILE" 2>/dev/null || echo 0)
  st_out=$(jq -r '.telemetry.tokensTotalOut // 0' "$STATE_FILE" 2>/dev/null || echo 0)
  if [ "$st_in" != "0" ] || [ "$st_out" != "0" ]; then
    tokens_in="$st_in"
    tokens_out="$st_out"
    # Approximate cost using opus-4.6 blended rate (matches majority of agents).
    # This is intentionally rough — Langfuse is the precise source when available.
    cost_usd=$(LC_ALL=C awk -v i="$st_in" -v o="$st_out" 'BEGIN{ printf("%.4f", (i*15.0 + o*75.0)/1e6) }')
    source="state-json"
  fi
fi

jq -nc \
  --arg runId "$RUN_ID" \
  --argjson tokensIn  "$tokens_in" \
  --argjson tokensOut "$tokens_out" \
  --argjson costUSD   "$cost_usd" \
  --arg source "$source" \
  '{ runId: $runId, tokensIn: $tokensIn, tokensOut: $tokensOut, costUSD: $costUSD, source: $source }'
