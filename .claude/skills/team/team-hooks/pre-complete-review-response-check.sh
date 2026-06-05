#!/bin/bash
# pre-complete-review-response-check.sh — UFR-022 receiving-code-review enforcement.
#
# Absorbed from superpowers:receiving-code-review (2026-05-31, Q4). The reviewer
# rejection loop is ILLIMITED (REGLE 14) — strict discipline on the SENDING side,
# none on the RECEIVING side. An agent that performatively agrees to a wrong
# finding can thrash forever OR degrade the code to satisfy a bad review. This
# hook adds the teeth: once a CHANGES_REQUESTED happened (reviewerRejectionLoops
# >= 1), the re-spawned phase MUST produce review-response.md with, per finding,
# a verdict (ACCEPT|DISPUTE|CLARIFY); every DISPUTE MUST carry technical Evidence;
# and NO performative-agreement phrase is allowed (anti-sycophancy, aligns UFR-013).
#
# Tiered: loops < 1 → PASS (no rejection occurred). loops >= 1 → full contract.
# Runs in the verify gate (Step 6).
#
# Usage: RUN_ID=YYYY-MM-DD-slug .claude/skills/team/team-hooks/pre-complete-review-response-check.sh
# Exits 0 PASS | 1 FAIL. Self-test: --self-test runs scenarios and exits 0/1.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
RUN_ID="${RUN_ID:-}"
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
STATE_FILE="$STATE_DIR/state.json"
RESPONSE="$STATE_DIR/review-response.md"

# Performative-agreement phrases forbidden in a review response (anti-sycophancy).
# Case-insensitive, EN + FR. Actions speak — state the fix, never thank/flatter.
PERFORMATIVE_RE='you'\''re absolutely right|tu as (tout à fait |entièrement )?raison|great point|excellent feedback|bonne remarque|thanks for catching|thank you for catching|merci d'\''avoir (relevé|repéré)|good catch[!,]'

# check_with_files <loops:int> <review-response-path>
# Returns 0 PASS, 1 FAIL. Echoes reason on FAIL.
check_with_files() {
  local loops="$1" resp="$2"
  if [ "${loops:-0}" -lt 1 ]; then
    return 0  # no rejection happened — nothing to respond to
  fi
  if [ ! -f "$resp" ]; then
    echo "  MISSING: reviewerRejectionLoops=$loops (>= 1) but no review-response.md — the re-spawned phase did not document how it handled the reviewer findings."
    return 1
  fi
  local fail=0
  # Must contain at least one verdict marker.
  if ! grep -qiE 'Verdict: *(ACCEPT|DISPUTE|CLARIFY)' "$resp"; then
    echo "  INCOMPLETE: no 'Verdict: ACCEPT|DISPUTE|CLARIFY' block found."
    fail=1
  fi
  # Every DISPUTE verdict must be followed (within the next 3 lines) by an Evidence: line.
  # Implemented simply: count DISPUTE verdicts vs Evidence lines — disputes must not exceed evidence.
  local disputes evidences
  disputes=$(grep -ciE 'Verdict: *DISPUTE' "$resp" || true)
  evidences=$(grep -ciE '^- *Evidence:' "$resp" || true)
  if [ "${disputes:-0}" -gt "${evidences:-0}" ]; then
    echo "  UNSUPPORTED DISPUTE: $disputes DISPUTE verdict(s) but only $evidences 'Evidence:' line(s) — every dispute needs technical evidence (path:line / test result)."
    fail=1
  fi
  # No performative-agreement phrase.
  if grep -qiE "$PERFORMATIVE_RE" "$resp"; then
    echo "  PERFORMATIVE AGREEMENT detected (anti-sycophancy, UFR-013): $(grep -ioE "$PERFORMATIVE_RE" "$resp" | head -1)"
    fail=1
  fi
  return $fail
}

self_test() {
  echo "pre-complete-review-response-check self-test"
  local TMP PASS=0 FAIL=0
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' RETURN

  # Scenario 1 : no rejection → PASS even without a response
  if check_with_files 0 "$TMP/none.md" >/dev/null; then
    echo "  PASS  loops=0 no-response → PASS"; PASS=$((PASS + 1))
  else
    echo "  FAIL  loops=0 → blocked (false positive)"; FAIL=$((FAIL + 1))
  fi

  # Scenario 2 : rejection, no response file → FAIL
  if check_with_files 1 "$TMP/none.md" >/dev/null; then
    echo "  FAIL  loops=1 no-response → passed (missed)"; FAIL=$((FAIL + 1))
  else
    echo "  PASS  loops=1 no-response → correctly blocked"; PASS=$((PASS + 1))
  fi

  # Scenario 3 : complete response (verdicts, dispute has evidence, no sycophancy) → PASS
  cat > "$TMP/good.md" <<'MD'
# Review response
## Finding 1
- Verdict: ACCEPT
- Action: fixed at a.ts:10
## Finding 2
- Verdict: DISPUTE
- Evidence: b.ts:42 already guards this; test cov.test.ts:8 passes
- Action: question au Tech Lead
MD
  if check_with_files 1 "$TMP/good.md" >/dev/null; then
    echo "  PASS  loops=1 complete-response → PASS"; PASS=$((PASS + 1))
  else
    echo "  FAIL  loops=1 complete-response → blocked (false positive)"; FAIL=$((FAIL + 1))
  fi

  # Scenario 4 : DISPUTE without Evidence → FAIL
  cat > "$TMP/nodispute.md" <<'MD'
# Review response
## Finding 1
- Verdict: DISPUTE
- Action: skipping this one
MD
  if check_with_files 1 "$TMP/nodispute.md" >/dev/null; then
    echo "  FAIL  loops=1 dispute-no-evidence → passed (missed)"; FAIL=$((FAIL + 1))
  else
    echo "  PASS  loops=1 dispute-no-evidence → correctly blocked"; PASS=$((PASS + 1))
  fi

  # Scenario 5 : performative agreement → FAIL
  cat > "$TMP/syco.md" <<'MD'
# Review response
## Finding 1
- Verdict: ACCEPT
- You're absolutely right! Fixed at a.ts:10
MD
  if check_with_files 1 "$TMP/syco.md" >/dev/null; then
    echo "  FAIL  loops=1 performative → passed (missed sycophancy)"; FAIL=$((FAIL + 1))
  else
    echo "  PASS  loops=1 performative → correctly blocked"; PASS=$((PASS + 1))
  fi

  echo "self-test: $PASS pass, $FAIL fail"
  [ "$FAIL" -eq 0 ]
}

[ "${1:-}" = "--self-test" ] && { self_test; exit $?; }

if [ -z "$RUN_ID" ] || [ ! -f "$STATE_FILE" ]; then
  echo "pre-complete-review-response-check: RUN_ID unset or state.json missing — skip"
  exit 0
fi
command -v jq &>/dev/null || { echo "pre-complete-review-response-check: jq missing — skip"; exit 0; }

LOOPS=$(jq -r '.telemetry.reviewerRejectionLoops // 0' "$STATE_FILE" 2>/dev/null)
[ -z "$LOOPS" ] && LOOPS=0

if check_with_files "$LOOPS" "$RESPONSE"; then
  echo "pre-complete-review-response-check: PASS (reviewerRejectionLoops=$LOOPS)"
  exit 0
else
  echo ""
  echo "pre-complete-review-response-check: FAIL — receiving-code-review discipline not met."
  echo "Action : re-spawn fresh the phase WITH team-protocols/receiving-code-review.md."
  echo "         The agent must write review-response.md: a verdict per finding,"
  echo "         technical Evidence for every DISPUTE, and ZERO performative agreement."
  exit 1
fi
