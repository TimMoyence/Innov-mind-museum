#!/bin/bash
# pre-complete-tier-enforcement.sh — UFR-022 Gate C (test-tier enforcement, ADR-012).
#
# Runs in Step 6 (verify). For every UC tagged integration|contract|e2e in
# test-contract.md, asserts its materialised test (from red-test-manifest.json):
#   - lives at the right path  (tests/integration/ | tests/contract/ | .maestro/ or tests/e2e/)
#   - integration: the file imports a real infra boundary (DataSource/harness/testcontainer)
# This is the lock that makes "tag integration then write a unit mock" impossible —
# the exact gap that let the quota INSERT...RETURNING bug escape to prod.
#
# Usage: RUN_ID=YYYY-MM-DD-slug .claude/skills/team/team-hooks/pre-complete-tier-enforcement.sh
# Exit: 0 PASS | 1 FAIL.  Self-test: --self-test.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
BOUNDARY_REGEX='DataSource|testcontainer|integration-harness|[Hh]arness|getDataSource|createConnection|pgvector'

# emit "UC tier" lines from a contract
uc_tiers() {
  local file="$1"
  local in_sec=0 in_uc=0 uc="" tier=""
  _emit() { [ "$in_uc" = 1 ] && [ -n "$uc" ] && printf '%s %s\n' "$uc" "${tier:-none}"; }
  while IFS= read -r line; do
    case "$line" in '## Use-cases'*) in_sec=1; continue ;; esac
    [ "$in_sec" = 1 ] || continue
    case "$line" in
      '## '*) _emit; in_sec=0; in_uc=0; continue ;;
      '### UC-'*) _emit; in_uc=1; uc="${line#'### '}"; uc="${uc%% —*}"; tier="" ; continue ;;
    esac
    [ "$in_uc" = 1 ] || continue
    case "$line" in
      *'**Tier**'*) tier=$(printf '%s' "$line" | sed -E 's/.*\*\*Tier\*\*[[:space:]]*:[[:space:]]*([a-zA-Z]+).*/\1/') ;;
    esac
  done < "$file"
  _emit
}

# check <contract> <manifest> <base_dir> -> "<VERDICT>|<details>"
check() {
  local contract="$1" manifest="$2" base="$3"
  [ -f "$contract" ] || { printf 'SKIP|no test-contract.md\n'; return 0; }
  [ -f "$manifest" ] || { printf 'SKIP|no manifest\n'; return 0; }
  command -v jq &>/dev/null || { printf 'SKIP|jq missing\n'; return 0; }

  local viol=""
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    local uc tier; uc="${row%% *}"; tier="${row#* }"
    case "$tier" in integration|contract|e2e) ;; *) continue ;; esac
    local path; path=$(jq -r --arg k "$uc" '.[$k].path // empty' "$manifest")
    if [ -z "$path" ]; then
      viol="${viol}${uc}(${tier}:no-manifest-path) "; continue
    fi
    case "$tier" in
      integration)
        case "$path" in *tests/integration/*) ;; *) viol="${viol}${uc}(integration@${path}:wrong-dir) "; continue ;; esac
        local full="$base/$path"
        if [ -f "$full" ] && ! grep -qE "$BOUNDARY_REGEX" "$full"; then
          viol="${viol}${uc}(integration@${path}:no-real-boundary-import) "
        fi
        ;;
      contract)
        case "$path" in *tests/contract/*) ;; *) viol="${viol}${uc}(contract@${path}:wrong-dir) " ;; esac
        ;;
      e2e)
        case "$path" in *.maestro/*|*tests/e2e/*) ;; *) viol="${viol}${uc}(e2e@${path}:wrong-dir) " ;; esac
        ;;
    esac
  done <<EOF
$(uc_tiers "$contract")
EOF

  if [ -n "$viol" ]; then
    printf 'FAIL|tier violations: %s\n' "${viol% }"; return 1
  fi
  printf 'PASS|all integration/contract/e2e UCs land at the right tier\n'; return 0
}

self_test() {
  local TMP; TMP=$(mktemp -d); trap 'rm -rf "$TMP"' RETURN
  local PASS=0 FAIL=0
  mkdir -p "$TMP/tests/integration" "$TMP/tests/unit" "$TMP/tests/contract" "$TMP/.maestro"
  echo "import { DataSource } from 'typeorm'; test('x',()=>{})" > "$TMP/tests/integration/good.test.ts"
  echo "test('x',()=>{ expect(1).toBe(1) })" > "$TMP/tests/integration/nobound.test.ts"
  echo "test('x',()=>{})" > "$TMP/tests/contract/c.test.ts"
  echo "appId: x" > "$TMP/.maestro/flow.yaml"
  _run() {
    local label="$1" expect="$2" contract="$3" manifest="$4"
    local out v; out=$(check "$contract" "$manifest" "$TMP"); v="${out%%|*}"
    if [ "$v" = "$expect" ]; then PASS=$((PASS+1)); printf '  [PASS] %-30s -> %s\n' "$label" "$v"
    else FAIL=$((FAIL+1)); printf '  [FAIL] %-30s expected %s got %s (%s)\n' "$label" "$expect" "$v" "$out"; fi
  }
  # integration UC, good path + boundary
  cat > "$TMP/c-ok.md" <<'EOF'
## Use-cases
### UC-1 — q
- **Tier** : integration
EOF
  echo '{"UC-1":{"path":"tests/integration/good.test.ts","sha256":"x"}}' > "$TMP/m-ok.json"
  _run "integration-ok" "PASS" "$TMP/c-ok.md" "$TMP/m-ok.json"
  # integration UC, wrong dir (unit)
  echo '{"UC-1":{"path":"tests/unit/good.test.ts","sha256":"x"}}' > "$TMP/m-wrong.json"
  _run "integration-wrong-dir" "FAIL" "$TMP/c-ok.md" "$TMP/m-wrong.json"
  # integration UC, right dir but no boundary import
  echo '{"UC-1":{"path":"tests/integration/nobound.test.ts","sha256":"x"}}' > "$TMP/m-nobound.json"
  _run "integration-no-boundary" "FAIL" "$TMP/c-ok.md" "$TMP/m-nobound.json"
  # e2e UC at .maestro
  cat > "$TMP/c-e2e.md" <<'EOF'
## Use-cases
### UC-1 — flow
- **Tier** : e2e
EOF
  echo '{"UC-1":{"path":".maestro/flow.yaml","sha256":"x"}}' > "$TMP/m-e2e.json"
  _run "e2e-maestro-ok" "PASS" "$TMP/c-e2e.md" "$TMP/m-e2e.json"
  # unit UC ignored entirely
  cat > "$TMP/c-unit.md" <<'EOF'
## Use-cases
### UC-1 — pure
- **Tier** : unit
EOF
  echo '{"UC-1":{"path":"tests/unit/good.test.ts","sha256":"x"}}' > "$TMP/m-unit.json"
  _run "unit-ignored" "PASS" "$TMP/c-unit.md" "$TMP/m-unit.json"
  # contract UC good
  cat > "$TMP/c-contract.md" <<'EOF'
## Use-cases
### UC-1 — spec
- **Tier** : contract
EOF
  echo '{"UC-1":{"path":"tests/contract/c.test.ts","sha256":"x"}}' > "$TMP/m-contract.json"
  _run "contract-ok" "PASS" "$TMP/c-contract.md" "$TMP/m-contract.json"
  printf 'self-test: %d pass, %d fail\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
}

[ "${1:-}" = "--self-test" ] && { self_test; exit $?; }

RUN_ID="${RUN_ID:-}"
[ -z "$RUN_ID" ] && { echo "pre-complete-tier-enforcement: RUN_ID unset — skip"; exit 0; }
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
[ -d "$STATE_DIR" ] || { echo "pre-complete-tier-enforcement: STATE_DIR missing — skip"; exit 0; }

OUT=$(check "$STATE_DIR/test-contract.md" "$STATE_DIR/red-test-manifest.json" "$REPO_ROOT"); RC=$?
VERDICT="${OUT%%|*}"; DETAILS="${OUT#*|}"
echo "pre-complete-tier-enforcement: $VERDICT (${DETAILS%$'\n'})"
if [ "$VERDICT" = "FAIL" ]; then
  STORY="$STATE_DIR/STORY.md"
  [ -f "$STORY" ] && {
    printf '\n## gate-C tier-enforcement — pre-complete-tier-enforcement — %s\n\nFAIL — %s\nA UC tagged integration/contract/e2e was materialised as the wrong tier (e.g. a unit mock). Re-spawn fresh red.\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${DETAILS%$'\n'}" >> "$STORY"
  }
fi
exit "$RC"
