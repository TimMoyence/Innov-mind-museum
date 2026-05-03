#!/usr/bin/env bash
# cost-estimate.sh — pre-run cost budget for a /team dispatch.
# T1.1 ROADMAP_TEAM (KR1 cost predictability ≤30% delta).
#
# Static lookup bootstrap (will be refined from cost-history.json once ≥10 runs
# accumulated — see lib/cost-history.sh).
#
# Usage:
#   cost-estimate.sh <pipeline> <agents-csv> [complexity]
#     pipeline    = micro | standard | enterprise
#     agents-csv  = comma-separated subset of: architect,editor,verifier,security,reviewer,documenter
#     complexity  = integer 1..5 (default 3)
#
# Output (stdout, single-line JSON):
#   {"pipeline":"standard","complexity":3,"perAgent":{...},"totalTokensIn":N,"totalTokensOut":N,"totalCostUSD":N.NN,"methodology":"static-bootstrap-2026-05"}
#
# Exit:
#   0 OK
#   1 invalid argument
#   2 jq missing

set -euo pipefail

PIPELINE="${1:-}"
AGENTS_CSV="${2:-}"
COMPLEXITY="${3:-3}"

if [ -z "$PIPELINE" ] || [ -z "$AGENTS_CSV" ]; then
  echo "usage: cost-estimate.sh <pipeline> <agents-csv> [complexity]" >&2
  exit 1
fi

case "$PIPELINE" in
  micro|standard|enterprise) ;;
  *) echo "invalid pipeline: $PIPELINE (expected micro|standard|enterprise)" >&2; exit 1 ;;
esac

if ! [[ "$COMPLEXITY" =~ ^[1-5]$ ]]; then
  echo "invalid complexity: $COMPLEXITY (expected 1..5)" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq required" >&2
  exit 2
fi

# Pricing table 2026 (USD per 1M tokens). Opus-4.7 estimate matches opus-4.6 absent
# public delta — refresh on next Anthropic release.
declare -A IN_RATE OUT_RATE
IN_RATE[opus-4.7]=15.00;  OUT_RATE[opus-4.7]=75.00
IN_RATE[opus-4.6]=15.00;  OUT_RATE[opus-4.6]=75.00
IN_RATE[sonnet-4.6]=3.00; OUT_RATE[sonnet-4.6]=15.00

# Per-agent baseline at pipeline=standard, complexity=3.
declare -A AGENT_MODEL BASELINE_IN BASELINE_OUT
AGENT_MODEL[architect]=opus-4.7;   BASELINE_IN[architect]=8000;   BASELINE_OUT[architect]=4000
AGENT_MODEL[editor]=opus-4.6;      BASELINE_IN[editor]=15000;     BASELINE_OUT[editor]=8000
AGENT_MODEL[verifier]=opus-4.6;    BASELINE_IN[verifier]=6000;    BASELINE_OUT[verifier]=2000
AGENT_MODEL[security]=opus-4.6;    BASELINE_IN[security]=8000;    BASELINE_OUT[security]=3000
AGENT_MODEL[reviewer]=opus-4.7;    BASELINE_IN[reviewer]=10000;   BASELINE_OUT[reviewer]=4000
AGENT_MODEL[documenter]=sonnet-4.6;BASELINE_IN[documenter]=5000;  BASELINE_OUT[documenter]=2000

# Pipeline multiplier — captures fan-out + corrective-loop reality.
case "$PIPELINE" in
  micro)      P_MULT="0.4" ;;
  standard)   P_MULT="1.0" ;;
  enterprise) P_MULT="2.5" ;;
esac

# Complexity multiplier — linear (1=0.6, 3=1.0, 5=1.5).
C_MULT=$(LC_ALL=C awk -v c="$COMPLEXITY" 'BEGIN{ printf("%.2f", 0.4 + 0.2*c) }')

per_agent_json="{}"
total_in=0
total_out=0
total_cost="0"

IFS=',' read -r -a AGENTS <<< "$AGENTS_CSV"
for agent in "${AGENTS[@]}"; do
  agent="${agent## }"; agent="${agent%% }"
  if [ -z "${AGENT_MODEL[$agent]+x}" ]; then
    echo "unknown agent: $agent" >&2
    exit 1
  fi
  model="${AGENT_MODEL[$agent]}"
  in_tok=$(LC_ALL=C awk -v b="${BASELINE_IN[$agent]}" -v p="$P_MULT" -v c="$C_MULT" 'BEGIN{ printf("%d", b*p*c) }')
  out_tok=$(LC_ALL=C awk -v b="${BASELINE_OUT[$agent]}" -v p="$P_MULT" -v c="$C_MULT" 'BEGIN{ printf("%d", b*p*c) }')
  cost=$(LC_ALL=C awk -v i="$in_tok" -v o="$out_tok" -v ir="${IN_RATE[$model]}" -v or="${OUT_RATE[$model]}" \
           'BEGIN{ printf("%.4f", (i*ir + o*or)/1e6) }')
  per_agent_json=$(jq --arg a "$agent" --arg m "$model" \
                      --argjson ti "$in_tok" --argjson to "$out_tok" --argjson c "$cost" \
                      '.[$a] = { model: $m, tokensIn: $ti, tokensOut: $to, costUSD: $c }' \
                      <<< "$per_agent_json")
  total_in=$((total_in + in_tok))
  total_out=$((total_out + out_tok))
  total_cost=$(LC_ALL=C awk -v a="$total_cost" -v b="$cost" 'BEGIN{ printf("%.4f", a+b) }')
done

jq -nc \
  --arg pipeline "$PIPELINE" \
  --argjson complexity "$COMPLEXITY" \
  --argjson perAgent "$per_agent_json" \
  --argjson totalTokensIn "$total_in" \
  --argjson totalTokensOut "$total_out" \
  --argjson totalCostUSD "$total_cost" \
  --arg methodology "static-bootstrap-2026-05" \
  '{ pipeline: $pipeline, complexity: $complexity, perAgent: $perAgent,
     totalTokensIn: $totalTokensIn, totalTokensOut: $totalTokensOut,
     totalCostUSD: $totalCostUSD, methodology: $methodology }'
