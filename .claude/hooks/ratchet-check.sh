#!/bin/bash
# Stop hook — surface unread regression alerts written by bg-quality-runner
# + enforce the mutation-score ratchet from .claude/quality-ratchet.json.
# Display-only for the alerts block; the mutation block can EXIT 1.
#
# Reads .claude/.cache/alerts.log (append-only by bg-runner).
# Tracks read-watermark in .claude/.cache/alerts.seen.
# Detects external truncation/rotation: if TOTAL < SEEN, reset SEEN to 0.
#
# Mutation-score gate (T3.3 audit-360 2026-05-16):
#   Reads museum-backend/reports/mutation/mutation.json (full json reporter
#   output) or, as fallback, museum-backend/reports/stryker-incremental.json
#   (incremental reporter — same mutation-testing-report-schema).
#   score = killed / (killed + survived + timeout + runtimeError)   (NoCoverage excluded)
#   Fails (exit 1) when score < cap from .mutationScore in quality-ratchet.json.
#   NO bypass env-var (UFR-020).
#   Gracefully degrades to exit 0 with a warning if the report file is missing
#   (first-run / fresh checkout scenario).

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "/Users/Tim/Desktop/all/dev/Pro/InnovMind")"
ALERTS="$REPO_ROOT/.claude/.cache/alerts.log"
SEEN="$REPO_ROOT/.claude/.cache/alerts.seen"
RATCHET_FILE="$REPO_ROOT/.claude/quality-ratchet.json"
MUTATION_REPORT="$REPO_ROOT/museum-backend/reports/mutation/mutation.json"
MUTATION_REPORT_FALLBACK="$REPO_ROOT/museum-backend/reports/stryker-incremental.json"

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

# -----------------------------------------------------------------------------
# Mutation-score ratchet (T3.3 audit-360 2026-05-16)
# -----------------------------------------------------------------------------
# Two optional CLI args (mock-testing affordance — NOT a bypass):
#   $1 = path to mutation report (defaults to museum-backend/reports/...)
#   $2 = path to quality-ratchet.json (defaults to .claude/quality-ratchet.json)
# UFR-020 reminder: there is NO env-var escape (no SKIP_MUTATION_RATCHET etc).
# Args exist solely so the test harness can point at synthetic fixtures.
MUTATION_RATCHET_EXIT=0
MUTATION_REPORT_ARG="${1:-}"
RATCHET_FILE_ARG="${2:-}"

if [ -n "$MUTATION_REPORT_ARG" ] && [ -f "$MUTATION_REPORT_ARG" ]; then
  MUTATION_REPORT_RESOLVED="$MUTATION_REPORT_ARG"
elif [ -n "$MUTATION_REPORT_ARG" ]; then
  # Arg supplied but file absent — treat like the auto-detection miss so the
  # operator sees a clear SKIP rather than a jq parse error.
  MUTATION_REPORT_RESOLVED=""
elif [ -f "$MUTATION_REPORT" ]; then
  MUTATION_REPORT_RESOLVED="$MUTATION_REPORT"
elif [ -f "$MUTATION_REPORT_FALLBACK" ]; then
  MUTATION_REPORT_RESOLVED="$MUTATION_REPORT_FALLBACK"
else
  MUTATION_REPORT_RESOLVED=""
fi

RATCHET_FILE_RESOLVED="${RATCHET_FILE_ARG:-$RATCHET_FILE}"

if [ -z "$MUTATION_REPORT_RESOLVED" ]; then
  echo "mutation: no report found at $MUTATION_REPORT (or fallback $MUTATION_REPORT_FALLBACK) — SKIP (first-run scenario; run pnpm stryker:run to populate)"
elif [ ! -f "$RATCHET_FILE_RESOLVED" ]; then
  echo "mutation: ratchet file $RATCHET_FILE_RESOLVED missing — SKIP"
elif ! command -v jq >/dev/null 2>&1; then
  echo "mutation: jq not installed — SKIP (install jq to enforce ratchet)"
else
  MUT_CAP=$(jq -r '.mutationScore // empty' "$RATCHET_FILE_RESOLVED" 2>/dev/null)
  if [ -z "$MUT_CAP" ] || [ "$MUT_CAP" = "null" ]; then
    echo "mutation: .mutationScore absent in $RATCHET_FILE_RESOLVED — SKIP"
  else
    # Aggregate killed/survived/timeout/runtimeError from the mutation-testing
    # report-schema (works for both full mutation.json and stryker-incremental.json).
    MUT_STATS=$(jq -r '
      [.files | to_entries[].value.mutants[].status] as $s
      | ($s | map(select(. == "Killed"))       | length) as $killed
      | ($s | map(select(. == "Survived"))     | length) as $survived
      | ($s | map(select(. == "Timeout"))      | length) as $timeout
      | ($s | map(select(. == "RuntimeError")) | length) as $rterr
      | "\($killed) \($survived) \($timeout) \($rterr)"
    ' "$MUTATION_REPORT_RESOLVED" 2>/dev/null)

    if [ -z "$MUT_STATS" ]; then
      echo "mutation: failed to parse $MUTATION_REPORT_RESOLVED — SKIP"
    else
      read -r MUT_KILLED MUT_SURVIVED MUT_TIMEOUT MUT_RTERR <<<"$MUT_STATS"
      MUT_DENOM=$((MUT_KILLED + MUT_SURVIVED + MUT_TIMEOUT + MUT_RTERR))
      if [ "$MUT_DENOM" -le 0 ] 2>/dev/null; then
        echo "mutation: empty denominator (killed+survived+timeout+runtimeError == 0) in $MUTATION_REPORT_RESOLVED — SKIP"
      else
        # Effective score: Timeout counted as kill per CLAUDE.md § Pièges connus
        # doctrine (Timeout-as-kill validated 2026-05-16 5/5 sample, open-handles
        # leak is the masking cause, not real test failures). Killed-only score
        # tracked as diagnostic — Survived is the real test-gap signal.
        MUT_KILLED_EFFECTIVE=$((MUT_KILLED + MUT_TIMEOUT))
        MUT_SCORE=$(LC_ALL=C awk -v k="$MUT_KILLED_EFFECTIVE" -v d="$MUT_DENOM" 'BEGIN { printf "%.2f", (k / d) * 100 }')
        MUT_SCORE_KILLED_ONLY=$(LC_ALL=C awk -v k="$MUT_KILLED" -v d="$MUT_DENOM" 'BEGIN { printf "%.2f", (k / d) * 100 }')
        MUT_VERDICT=$(LC_ALL=C awk -v s="$MUT_SCORE" -v c="$MUT_CAP" 'BEGIN { print (s + 0 >= c + 0) ? "PASS" : "FAIL" }')
        if [ "$MUT_VERDICT" = "PASS" ]; then
          echo "mutation: ${MUT_SCORE}% >= cap ${MUT_CAP}% PASS (killed=$MUT_KILLED timeout-as-kill=$MUT_TIMEOUT survived=$MUT_SURVIVED runtimeError=$MUT_RTERR ; killed-only=${MUT_SCORE_KILLED_ONLY}% diagnostic)"
        else
          echo "mutation: ${MUT_SCORE}% < cap ${MUT_CAP}% FAIL (killed=$MUT_KILLED timeout-as-kill=$MUT_TIMEOUT survived=$MUT_SURVIVED runtimeError=$MUT_RTERR ; killed-only=${MUT_SCORE_KILLED_ONLY}% — investigate growing Survived count, NOT Timeout)"
          MUTATION_RATCHET_EXIT=1
        fi
      fi
    fi
  fi
fi

exit $MUTATION_RATCHET_EXIT
