#!/usr/bin/env bash
# quality-regression.sh — compare promptfoo eval output to baseline.
# T1.5 ROADMAP_TEAM (KR3) — fail if axis mean drops >5pts vs baseline.
#
# Usage:
#   quality-regression.sh <output_json> <baseline_json>
#
# Inputs:
#   output_json   — promptfoo eval JSON output (`npx promptfoo eval --output X`)
#   baseline_json — team-promptfoo/baseline-scores.json
#
# Output (stdout):
#   Single-line JSON: {pass, perAxis: { <axis>: { current, baseline, delta, breach } }, mean: {...}}
# Exit:
#   0 — within threshold (PASS)
#   1 — drop >5pts on at least one axis (FAIL)
#   2 — invalid args / missing files / parse error

set -uo pipefail

OUTPUT_JSON="${1:-}"
BASELINE_JSON="${2:-}"
THRESHOLD="${REGRESSION_THRESHOLD:-5}"

if [ -z "$OUTPUT_JSON" ] || [ -z "$BASELINE_JSON" ]; then
  echo "usage: quality-regression.sh <output_json> <baseline_json>" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq required" >&2
  exit 2
fi
[ -f "$OUTPUT_JSON" ]  || { echo "output not found: $OUTPUT_JSON" >&2; exit 2; }
[ -f "$BASELINE_JSON" ] || { echo "baseline not found: $BASELINE_JSON" >&2; exit 2; }

# Extract per-axis means from promptfoo output. Each test result has a parsed
# `output` matching reviewer JSON. We average across all tests.
current=$(jq -c '
  def axisMean(name):
    [ .results.results[]?.response.output as $o
      | if (name == "weightedMean") then $o.scoresOnFiveAxes.weightedMean
        else $o.scoresOnFiveAxes[name].score end
      | select(. != null) ]
    | (if length == 0 then null else (add / length) end);
  {
    correctness:     (axisMean("correctness")     | (. // 0)),
    security:        (axisMean("security")        | (. // 0)),
    maintainability: (axisMean("maintainability") | (. // 0)),
    testCoverage:    (axisMean("testCoverage")    | (. // 0)),
    docQuality:      (axisMean("docQuality")      | (. // 0)),
    weightedMean:    (axisMean("weightedMean")    | (. // 0))
  }
' "$OUTPUT_JSON" 2>/dev/null || echo '{}')

if [ "$current" = '{}' ] || [ -z "$current" ]; then
  echo '{"pass":false,"error":"unable_to_parse_promptfoo_output","perAxis":{},"mean":{}}'
  exit 1
fi

baseline=$(jq -c '.axisMeans' "$BASELINE_JSON")
if [ -z "$baseline" ] || [ "$baseline" = "null" ]; then
  echo '{"pass":false,"error":"baseline_axisMeans_missing"}'
  exit 1
fi

# Compute per-axis delta and check breach.
result=$(jq -nc \
  --argjson cur "$current" \
  --argjson base "$baseline" \
  --argjson thr "$THRESHOLD" \
  '
  ["correctness","security","maintainability","testCoverage","docQuality","weightedMean"]
  | reduce .[] as $axis ({pass: true, perAxis: {}, mean: {current: $cur.weightedMean, baseline: $base.weightedMean}};
      ($cur[$axis] // 0) as $c
      | ($base[$axis] // 0) as $b
      | (($b - $c) | (.*100 | round) / 100) as $delta
      | ($delta > $thr) as $breach
      | .perAxis[$axis] = { current: $c, baseline: $b, delta: $delta, breach: $breach }
      | if $breach then .pass = false else . end
    )
  ')

echo "$result"
[ "$(echo "$result" | jq -r .pass)" = "true" ] && exit 0 || exit 1
