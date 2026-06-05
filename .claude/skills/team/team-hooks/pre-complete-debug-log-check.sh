#!/bin/bash
# pre-complete-debug-log-check.sh — UFR-022 systematic-debugging enforcement.
#
# Absorbed from superpowers:systematic-debugging (2026-05-31, Q4 direction). The
# methodology is prose; THIS hook is the teeth /team adds: once the editor has
# burned >=2 corrective loops in a phase (intraPhaseHookLoops >= 2 — the /team cap
# where REGLE 10 STOPs and questions architecture), a documented debug-log.md is
# MANDATORY. No log = the editor thrashed without root-cause investigation = the
# exact failure the Iron Law forbids.
#
# Tiered (no false-blocking on trivial single fixes):
#   loops <  2 → PASS (a brief root-cause line in STORY suffices; no full log).
#   loops >= 2 → debug-log.md MUST exist with the 4 phase markers + >=1 hypothesis
#                + the Architecture-question section (Phase 4.5). Else FAIL.
#
# Runs in the verify gate (Step 6), alongside pre-complete-verify.sh.
#
# Usage: RUN_ID=YYYY-MM-DD-slug .claude/skills/team/team-hooks/pre-complete-debug-log-check.sh
# Exits 0 PASS | 1 FAIL. Self-test: --self-test runs scenarios and exits 0/1.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
RUN_ID="${RUN_ID:-}"
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
STATE_FILE="$STATE_DIR/state.json"
DEBUG_LOG="$STATE_DIR/debug-log.md"
LOOP_THRESHOLD=2

# check_with_files <loops:int> <debug-log-path>
# Returns 0 PASS, 1 FAIL. Echoes the reason on FAIL.
check_with_files() {
  local loops="$1" log="$2"
  if [ "${loops:-0}" -lt "$LOOP_THRESHOLD" ]; then
    return 0  # below cap — full debug-log not required
  fi
  if [ ! -f "$log" ]; then
    echo "  MISSING: intraPhaseHookLoops=$loops (>= $LOOP_THRESHOLD) but no debug-log.md — editor thrashed without systematic-debugging (Iron Law violated)."
    return 1
  fi
  local missing=""
  grep -q "## Phase 1" "$log" || missing+="Phase-1-root-cause "
  grep -q "## Phase 3" "$log" || missing+="Phase-3-hypotheses "
  grep -q "## Phase 4" "$log" || missing+="Phase-4-fix "
  grep -qiE "^- *Hypothesis" "$log" || missing+="at-least-one-Hypothesis "
  grep -qiE "## Architecture question" "$log" || missing+="Phase-4.5-architecture-question "
  if [ -n "$missing" ]; then
    echo "  INCOMPLETE debug-log.md (loops=$loops): missing [ $missing]"
    return 1
  fi
  return 0
}

self_test() {
  echo "pre-complete-debug-log-check self-test"
  local TMP PASS=0 FAIL=0
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' RETURN

  # Scenario 1 : loops < cap → PASS even without a log
  if check_with_files 1 "$TMP/none.md" >/dev/null; then
    echo "  PASS  loops=1 no-log → PASS"; PASS=$((PASS + 1))
  else
    echo "  FAIL  loops=1 no-log → blocked (false positive)"; FAIL=$((FAIL + 1))
  fi

  # Scenario 2 : loops >= cap, no log → FAIL
  if check_with_files 2 "$TMP/none.md" >/dev/null; then
    echo "  FAIL  loops=2 no-log → passed (missed)"; FAIL=$((FAIL + 1))
  else
    echo "  PASS  loops=2 no-log → correctly blocked"; PASS=$((PASS + 1))
  fi

  # Scenario 3 : loops >= cap, complete log → PASS
  cat > "$TMP/full.md" <<'MD'
# Debug log
## Phase 1 — Root cause
- Erreur : TypeError x
## Phase 2 — Pattern
## Phase 3 — Hypotheses
- Hypothesis 1: X because Y → test → fail: Z
## Phase 4 — Fix
- root-cause fix at a.ts:10
## Architecture question
- pattern sain, pas d'inertie
MD
  if check_with_files 2 "$TMP/full.md" >/dev/null; then
    echo "  PASS  loops=2 complete-log → PASS"; PASS=$((PASS + 1))
  else
    echo "  FAIL  loops=2 complete-log → blocked (false positive)"; FAIL=$((FAIL + 1))
  fi

  # Scenario 4 : loops >= cap, log missing Architecture section → FAIL
  cat > "$TMP/partial.md" <<'MD'
# Debug log
## Phase 1 — Root cause
## Phase 3 — Hypotheses
- Hypothesis 1: X
## Phase 4 — Fix
MD
  if check_with_files 2 "$TMP/partial.md" >/dev/null; then
    echo "  FAIL  loops=2 partial-log → passed (missed architecture gate)"; FAIL=$((FAIL + 1))
  else
    echo "  PASS  loops=2 partial-log → correctly blocked"; PASS=$((PASS + 1))
  fi

  echo "self-test: $PASS pass, $FAIL fail"
  [ "$FAIL" -eq 0 ]
}

[ "${1:-}" = "--self-test" ] && { self_test; exit $?; }

if [ -z "$RUN_ID" ] || [ ! -f "$STATE_FILE" ]; then
  echo "pre-complete-debug-log-check: RUN_ID unset or state.json missing — skip"
  exit 0
fi
command -v jq &>/dev/null || { echo "pre-complete-debug-log-check: jq missing — skip"; exit 0; }

LOOPS=$(jq -r '.telemetry.intraPhaseHookLoops // 0' "$STATE_FILE" 2>/dev/null)
[ -z "$LOOPS" ] && LOOPS=0

if check_with_files "$LOOPS" "$DEBUG_LOG"; then
  echo "pre-complete-debug-log-check: PASS (intraPhaseHookLoops=$LOOPS)"
  exit 0
else
  echo ""
  echo "pre-complete-debug-log-check: FAIL — systematic-debugging not documented at the corrective-loop cap."
  echo "Action : re-spawn fresh the offending phase WITH the debug protocol"
  echo "         (team-protocols/systematic-debugging.md). The editor must write debug-log.md"
  echo "         documenting root-cause + hypotheses + the architecture question before any further fix."
  exit 1
fi
