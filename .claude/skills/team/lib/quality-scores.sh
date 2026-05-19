#!/usr/bin/env bash
# quality-scores.sh — append reviewer 5-axis scores to quality-scores.json.
# T1.5 ROADMAP_TEAM (KR3 quality predictability).
#
# Usage:
#   quality-scores.sh <run_id> <code_review_json_path>
#
# Reads:    `<code_review_json_path>` (reviewer output, must contain scoresOnFiveAxes)
# Writes:   `.claude/skills/team/team-state/quality-scores.json`
# Output:   stdout = the appended entry (single-line JSON)
# Lock:     mkdir CAS, same pattern as cost-history.sh
# Truncate: keep last 200 entries
# Exit:     0 OK / 1 invalid args / 2 missing scores / 3 lock timeout

set -euo pipefail

RUN_ID="${1:-}"
REVIEW_JSON_PATH="${2:-}"

if [ -z "$RUN_ID" ] || [ -z "$REVIEW_JSON_PATH" ]; then
  echo "usage: quality-scores.sh <run_id> <code_review_json_path>" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq required" >&2
  exit 1
fi
if [ ! -f "$REVIEW_JSON_PATH" ]; then
  echo "code-review.json not found: $REVIEW_JSON_PATH" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SCORES_FILE="$REPO_ROOT/.claude/skills/team/team-state/quality-scores.json"
LOCK_DIR="$SCORES_FILE.lock.d"

# Validate input has the 5 axis scores.
mean=$(jq -r '.scoresOnFiveAxes.weightedMean // empty' "$REVIEW_JSON_PATH")
if [ -z "$mean" ] || [ "$mean" = "null" ]; then
  echo "scoresOnFiveAxes.weightedMean missing in $REVIEW_JSON_PATH (T1.5 contract)" >&2
  exit 2
fi

[ -f "$SCORES_FILE" ] || echo '[]' > "$SCORES_FILE"

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
  echo "quality-scores: lock timeout after 3s" >&2
  exit 3
fi
trap release_lock EXIT

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Findings tally supports TWO shapes for backward compatibility:
#   - canonical (per reviewer.md): { blocker: [...], important: [...], nit: [...] }
#   - legacy/flat (some early reviewer outputs): [{ severity: "blocker"|"high"|"medium"|"important"|"low"|"info"|"nit", ... }, ...]
# Severity mapping for the flat-array shape:
#   blocker → blocker
#   medium | high | important → important
#   low | info | nit → nit
entry=$(jq -nc \
  --arg runId "$RUN_ID" \
  --arg ts "$ts" \
  --slurpfile review "$REVIEW_JSON_PATH" \
  '{
    runId:    $runId,
    ts:       $ts,
    verdict:  $review[0].verdict,
    scores:   $review[0].scoresOnFiveAxes,
    findingsCount: (
      # dual-shape: ($review[0].findings | type) == "array" branch vs object-of-arrays canonical branch
      ($review[0].findings // {}) as $f
      | if ($f | type) == "array" then
          { blocker:   [$f[] | select(.severity == "blocker")]                                                | length,
            important: [$f[] | select(.severity == "medium" or .severity == "high" or .severity == "important")] | length,
            nit:       [$f[] | select(.severity == "low" or .severity == "info" or .severity == "nit")]       | length }
        else
          { blocker:   ($f.blocker   // [] | length),
            important: ($f.important // [] | length),
            nit:       ($f.nit       // [] | length) }
        end
    )
  }')

new_history=$(jq --argjson e "$entry" '. += [$e] | (if length > 200 then .[-200:] else . end)' "$SCORES_FILE")
echo "$new_history" > "$SCORES_FILE"

echo "$entry"
