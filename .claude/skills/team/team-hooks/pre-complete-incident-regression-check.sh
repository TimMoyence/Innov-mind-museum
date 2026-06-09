#!/bin/bash
# pre-complete-incident-regression-check.sh — UFR-022 Gate D (incident -> gate).
#
# Runs in Step 6 (verify) WHEN the run fixes an escaped bug recorded in
# docs/INCIDENT_LEDGER.md. The dispatcher passes INC_ID (from the run DESCRIPTION
# / commit msg). Asserts the fix's test-contract.md contains a regression UC:
#   - >=1 UC with `Catégorie: regression` whose `Couvre` references the INC-id
#   - that UC's Tier >= the ledger's `Tier-qui-l'aurait-pris`
#     (you cannot "fix" a real-Postgres bug with a unit mock)
#
# Tier rank: unit=1, integration=2, contract=2, e2e=3.
#
# Usage: RUN_ID=... INC_ID=INC-YYYY-MM-DD-slug .../pre-complete-incident-regression-check.sh
# No INC_ID -> not applicable -> PASS.  Exit: 0 PASS | 1 FAIL.  Self-test: --self-test.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

tier_rank() {
  case "$1" in
    unit) echo 1 ;; integration) echo 2 ;; contract) echo 2 ;; e2e) echo 3 ;; *) echo 0 ;;
  esac
}

# ledger_tier <ledger> <inc_id> -> echoes the tier keyword from the row, or empty
ledger_tier() {
  local ledger="$1" inc="$2" row col4
  row=$(grep -F "| $inc " "$ledger" 2>/dev/null | head -1)
  [ -z "$row" ] && row=$(grep -F "$inc" "$ledger" 2>/dev/null | grep '^|' | head -1)
  [ -z "$row" ] && return 0
  col4=$(printf '%s' "$row" | awk -F'|' '{print $5}')
  printf '%s' "$col4" | grep -oE 'unit|integration|contract|e2e' | head -1
}

# regression_uc_tier <contract> <inc_id> -> echoes tier of the regression UC covering inc, or empty
regression_uc_tier() {
  local contract="$1" inc="$2"
  local in_sec=0 in_uc=0 cat="" tier="" couvre="" found=""
  _emit() {
    if [ "$in_uc" = 1 ] && [ "$cat" = "regression" ]; then
      case "$couvre" in *"$inc"*) found="$tier" ;; esac
    fi
  }
  while IFS= read -r line; do
    case "$line" in '## Use-cases'*) in_sec=1; continue ;; esac
    [ "$in_sec" = 1 ] || continue
    case "$line" in
      '## '*) _emit; in_sec=0; in_uc=0; continue ;;
      '### UC-'*) _emit; in_uc=1; cat=""; tier=""; couvre=""; continue ;;
    esac
    [ "$in_uc" = 1 ] || continue
    case "$line" in
      *'**Catégorie**'*) cat=$(printf '%s' "$line" | sed -E 's/.*\*\*Catégorie\*\*[[:space:]]*:[[:space:]]*([a-zA-Z]+).*/\1/') ;;
      *'**Tier**'*)      tier=$(printf '%s' "$line" | sed -E 's/.*\*\*Tier\*\*[[:space:]]*:[[:space:]]*([a-zA-Z]+).*/\1/') ;;
      *'**Couvre**'*)    couvre="$line" ;;
    esac
  done < "$contract"
  _emit
  printf '%s' "$found"
}

# check <inc_id> <contract> <ledger> -> "<VERDICT>|<details>"
check() {
  local inc="$1" contract="$2" ledger="$3"
  [ -z "$inc" ] && { printf 'PASS|no INC_ID — not an incident fix\n'; return 0; }
  [ -f "$contract" ] || { printf 'FAIL|INC_ID=%s but no test-contract.md\n' "$inc"; return 1; }
  [ -f "$ledger" ]   || { printf 'FAIL|INC_ID=%s but no INCIDENT_LEDGER.md\n' "$inc"; return 1; }

  local lt; lt=$(ledger_tier "$ledger" "$inc")
  if [ -z "$lt" ]; then
    printf 'FAIL|INC_ID=%s not found in ledger (or no tier in row)\n' "$inc"; return 1
  fi
  local ut; ut=$(regression_uc_tier "$contract" "$inc")
  if [ -z "$ut" ]; then
    printf 'FAIL|no regression UC covering %s in contract\n' "$inc"; return 1
  fi
  local lr ur; lr=$(tier_rank "$lt"); ur=$(tier_rank "$ut")
  if [ "$ur" -lt "$lr" ]; then
    printf 'FAIL|regression UC tier=%s (rank %s) < ledger Tier-qui-l-aurait-pris=%s (rank %s)\n' "$ut" "$ur" "$lt" "$lr"; return 1
  fi
  printf 'PASS|regression UC for %s present, tier=%s >= ledger %s\n' "$inc" "$ut" "$lt"; return 0
}

self_test() {
  local TMP; TMP=$(mktemp -d); trap 'rm -rf "$TMP"' RETURN
  local PASS=0 FAIL=0
  cat > "$TMP/ledger.md" <<'EOF'
| INC-id | Symptôme | Échappé | Tier-qui-l'aurait-pris | UC | Fix |
|---|---|---|---|---|---|
| INC-2026-06-05-quota-noblock | quota | prod | integration (vrai pg) | — | f74ce7de |
EOF
  cat > "$TMP/c-ok.md" <<'EOF'
## Use-cases
### UC-9 — regression quota
- **Couvre**     : INC-2026-06-05-quota-noblock
- **Catégorie**  : regression
- **Tier**       : integration
EOF
  cat > "$TMP/c-weak.md" <<'EOF'
## Use-cases
### UC-9 — regression quota
- **Couvre**     : INC-2026-06-05-quota-noblock
- **Catégorie**  : regression
- **Tier**       : unit
EOF
  cat > "$TMP/c-none.md" <<'EOF'
## Use-cases
### UC-1 — happy
- **Couvre**     : AC-1
- **Catégorie**  : happy
- **Tier**       : unit
EOF
  _run() {
    local label="$1" expect="$2" inc="$3" contract="$4"
    local out v; out=$(check "$inc" "$contract" "$TMP/ledger.md"); v="${out%%|*}"
    if [ "$v" = "$expect" ]; then PASS=$((PASS+1)); printf '  [PASS] %-28s -> %s\n' "$label" "$v"
    else FAIL=$((FAIL+1)); printf '  [FAIL] %-28s expected %s got %s (%s)\n' "$label" "$expect" "$v" "$out"; fi
  }
  _run "no-inc-id"            "PASS" "" "$TMP/c-ok.md"
  _run "regression-ok"        "PASS" "INC-2026-06-05-quota-noblock" "$TMP/c-ok.md"
  _run "regression-too-weak"  "FAIL" "INC-2026-06-05-quota-noblock" "$TMP/c-weak.md"
  _run "no-regression-uc"     "FAIL" "INC-2026-06-05-quota-noblock" "$TMP/c-none.md"
  _run "inc-not-in-ledger"    "FAIL" "INC-9999-99-99-ghost" "$TMP/c-ok.md"
  printf 'self-test: %d pass, %d fail\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
}

[ "${1:-}" = "--self-test" ] && { self_test; exit $?; }

RUN_ID="${RUN_ID:-}"
INC_ID="${INC_ID:-}"
[ -z "$RUN_ID" ] && { echo "pre-complete-incident-regression-check: RUN_ID unset — skip"; exit 0; }
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
[ -d "$STATE_DIR" ] || { echo "pre-complete-incident-regression-check: STATE_DIR missing — skip"; exit 0; }

OUT=$(check "$INC_ID" "$STATE_DIR/test-contract.md" "$REPO_ROOT/docs/INCIDENT_LEDGER.md"); RC=$?
VERDICT="${OUT%%|*}"; DETAILS="${OUT#*|}"
echo "pre-complete-incident-regression-check: $VERDICT (${DETAILS%$'\n'})"
if [ "$VERDICT" = "FAIL" ]; then
  STORY="$STATE_DIR/STORY.md"
  [ -f "$STORY" ] && {
    printf '\n## gate-D incident-regression — %s\n\nFAIL — %s\nAdd a regression UC (Tier >= ledger) to the contract via fresh test-analyst, then fresh red.\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${DETAILS%$'\n'}" >> "$STORY"
  }
fi
exit "$RC"
