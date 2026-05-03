#!/usr/bin/env bash
# reviewer-eval-shim.sh — promptfoo provider exec wrapper.
# T1.5 ROADMAP_TEAM (KR3) — feeds reviewer agent via Anthropic API to score
# corpus diffs on 5 axes; outputs reviewer JSON to stdout.
#
# promptfoo `exec:` provider sends the rendered prompt on stdin and reads
# stdout as the response. We map the prompt-string vars back into a structured
# user message + system prompt loaded from `.claude/agents/reviewer.md`.
#
# Modes:
#   - REAL  (ANTHROPIC_API_KEY set + REVIEWER_EVAL_MODE != "mock"):
#     POST /v1/messages with reviewer.md as system + corpus entry as user.
#     Parses model JSON output → emits reviewer.json schema.
#   - MOCK  (default offline):
#     Deterministic scores derived from feature_id hash → enables harness
#     correctness testing without API spend. Drift in mock = harness drift.
#
# Output: single-line JSON matching reviewer.md scoresOnFiveAxes contract.
# Exit 0 always — promptfoo treats non-zero as test failure.

set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo '{"error":"jq missing"}'
  exit 0
fi

PROMPT_INPUT=$(cat)

extract() {
  local key="$1"
  echo "$PROMPT_INPUT" | tr '|' '\n' | awk -F= -v k="$key" '$1==k { sub(/^[^=]+=/, ""); print }'
}

feature_id=$(extract feature_id)
category=$(extract category)
description=$(extract description)
diff_excerpt=$(extract diff)
spec_excerpt=$(extract spec)

[ -z "$feature_id" ] && feature_id="unknown"

mock_scores() {
  # Deterministic scores from feature_id hash (last byte of sha1).
  local h
  h=$(printf "%s" "$feature_id" | shasum | cut -d' ' -f1 | cut -c1-2)
  local seed=$((16#$h))
  # Map seed 0..255 → axis scores in 70..95 (typical good output range).
  local correctness=$(( 75 + (seed % 16) ))
  local security=$(( 78 + ((seed >> 1) % 14) ))
  local maintainability=$(( 76 + ((seed >> 2) % 16) ))
  local testCoverage=$(( 70 + ((seed >> 3) % 18) ))
  local docQuality=$(( 72 + ((seed >> 4) % 18) ))
  local mean
  mean=$(LC_ALL=C awk -v c=$correctness -v s=$security -v m=$maintainability -v t=$testCoverage -v d=$docQuality \
         'BEGIN{ printf("%.2f", c*0.30 + s*0.25 + m*0.20 + t*0.15 + d*0.10) }')

  jq -nc \
    --arg fid "$feature_id" \
    --arg cat "$category" \
    --argjson c "$correctness" --argjson s "$security" --argjson m "$maintainability" \
    --argjson t "$testCoverage" --argjson d "$docQuality" --argjson mn "$mean" \
    '{
      runId: $fid,
      ts: (now | todate),
      verdict: (if $mn >= 85 then "APPROVED" elif $mn >= 70 then "CHANGES_REQUESTED" else "BLOCK" end),
      filesReviewed: [],
      findings: { blocker: [], important: [], nit: [] },
      scoresOnFiveAxes: {
        correctness:     { score: $c, weight: 0.30, reasoning: ("mock — category=" + $cat) },
        security:        { score: $s, weight: 0.25, reasoning: "mock" },
        maintainability: { score: $m, weight: 0.20, reasoning: "mock" },
        testCoverage:    { score: $t, weight: 0.15, reasoning: "mock" },
        docQuality:      { score: $d, weight: 0.10, reasoning: "mock" },
        weightedMean:    $mn
      }
    }'
}

real_scores() {
  # Lightweight one-shot to Anthropic API.
  local model="${REVIEWER_EVAL_MODEL:-claude-opus-4-7}"
  local sys_prompt
  sys_prompt=$(cat "$(dirname "${BASH_SOURCE[0]}")/../../../agents/reviewer.md" \
               2>/dev/null || echo "You are a code reviewer. Output JSON.")
  local user_msg
  user_msg=$(cat <<EOF
Score this corpus entry on the 5 quality axes (correctness, security, maintainability, testCoverage, docQuality), each 0-100.
Output ONLY the reviewer JSON per your <output_format> section, including scoresOnFiveAxes.

Feature: $feature_id
Category: $category
Description: $description
Spec excerpt: $spec_excerpt
Diff excerpt: $diff_excerpt
EOF
)
  local payload
  payload=$(jq -nc --arg model "$model" --arg sys "$sys_prompt" --arg usr "$user_msg" \
            '{model: $model, max_tokens: 2000, system: $sys, messages: [{role: "user", content: $usr}]}')
  local resp
  resp=$(curl -fsS -X POST 'https://api.anthropic.com/v1/messages' \
              --max-time 90 \
              -H "x-api-key: $ANTHROPIC_API_KEY" \
              -H 'anthropic-version: 2023-06-01' \
              -H 'content-type: application/json' \
              -d "$payload" 2>/dev/null || echo '')
  if [ -z "$resp" ]; then
    echo '{"error":"anthropic_unreachable","scoresOnFiveAxes":{"weightedMean":0}}'
    return
  fi
  # Extract first text block, strip code fences if present, validate JSON.
  local text
  text=$(echo "$resp" | jq -r '.content[0].text // empty' \
         | sed -e 's/^```json//' -e 's/^```//' -e 's/```$//')
  if echo "$text" | jq -e . >/dev/null 2>&1; then
    echo "$text" | jq -c .
  else
    echo '{"error":"non_json_response","scoresOnFiveAxes":{"weightedMean":0}}'
  fi
}

if [ -n "${ANTHROPIC_API_KEY:-}" ] && [ "${REVIEWER_EVAL_MODE:-real}" != "mock" ]; then
  real_scores
else
  mock_scores
fi
