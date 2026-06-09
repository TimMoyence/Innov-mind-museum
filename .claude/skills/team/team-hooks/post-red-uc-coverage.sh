#!/bin/bash
# post-red-uc-coverage.sh — UFR-022 Gate B (UC <-> test bidirectional traceability).
#
# Runs at the end of Step 5a (red), AFTER the editor produced the failing tests +
# the UC-keyed red-test-manifest.json. Verifies:
#   1. manifest is UC-keyed (new form: {"UC-<n>": {"path":..., "sha256":...}})
#   2. every UC-id in test-contract.md has >=1 manifest entry  (no untested UC)
#   3. every manifest entry maps to a UC-id in the contract     (no orphan test)
#
# Usage: RUN_ID=YYYY-MM-DD-slug .claude/skills/team/team-hooks/post-red-uc-coverage.sh
# Exit: 0 PASS | 1 FAIL.  Self-test: --self-test.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

# check <contract> <manifest> -> prints "<VERDICT>|<details>", RC 0/1
check() {
  local contract="$1" manifest="$2"
  if [ ! -f "$contract" ]; then
    printf 'SKIP|no test-contract.md (Gate A owns presence)\n'; return 0
  fi
  if [ ! -f "$manifest" ]; then
    printf 'SKIP|no red-test-manifest.json (pre-UFR-022 or micro path)\n'; return 0
  fi
  command -v jq &>/dev/null || { printf 'SKIP|jq missing\n'; return 0; }

  # 1. manifest must be UC-keyed, object-valued
  local flat
  flat=$(jq -r '[to_entries[] | select(.value | type != "object")] | length' "$manifest" 2>/dev/null || echo "ERR")
  if [ "$flat" = "ERR" ]; then
    printf 'FAIL|manifest not valid JSON\n'; return 1
  fi
  if [ "$flat" != "0" ]; then
    printf 'FAIL|manifest is flat {path:sha} — red must map UC-id -> {path,sha256}\n'; return 1
  fi
  local nonuc
  nonuc=$(jq -r '[keys[] | select(test("^UC-") | not)] | join(", ")' "$manifest")
  if [ -n "$nonuc" ]; then
    printf 'FAIL|manifest key(s) not UC-id: %s\n' "$nonuc"; return 1
  fi

  local contract_ucs manifest_ucs missing orphan
  contract_ucs=$(grep -oE '^### UC-[A-Za-z0-9_-]+' "$contract" | sed 's/^### //' | sort -u)
  manifest_ucs=$(jq -r 'keys[]' "$manifest" | sort -u)

  if [ -z "$contract_ucs" ]; then
    printf 'FAIL|no UC-id in contract (Gate A should have caught)\n'; return 1
  fi

  missing=$(comm -23 <(printf '%s\n' "$contract_ucs") <(printf '%s\n' "$manifest_ucs") | grep -v '^$' | tr '\n' ' ')
  orphan=$(comm -13 <(printf '%s\n' "$contract_ucs") <(printf '%s\n' "$manifest_ucs") | grep -v '^$' | tr '\n' ' ')

  if [ -n "$missing" ] || [ -n "$orphan" ]; then
    printf 'FAIL|untested-UC:[%s] orphan-test:[%s]\n' "${missing% }" "${orphan% }"; return 1
  fi
  printf 'PASS|bidirectional UC<->test traceability complete\n'; return 0
}

self_test() {
  local TMP; TMP=$(mktemp -d); trap 'rm -rf "$TMP"' RETURN
  local PASS=0 FAIL=0
  cat > "$TMP/contract.md" <<'EOF'
## Use-cases
### UC-1 — a
### UC-2 — b
EOF
  _run() {
    local label="$1" expect="$2" mf="$3"
    local out v; out=$(check "$TMP/contract.md" "$mf"); v="${out%%|*}"
    if [ "$v" = "$expect" ]; then PASS=$((PASS+1)); printf '  [PASS] %-26s -> %s\n' "$label" "$v"
    else FAIL=$((FAIL+1)); printf '  [FAIL] %-26s expected %s got %s (%s)\n' "$label" "$expect" "$v" "$out"; fi
  }
  echo '{"UC-1":{"path":"tests/a.test.ts","sha256":"x"},"UC-2":{"path":"tests/b.test.ts","sha256":"y"}}' > "$TMP/ok.json"
  _run "matched" "PASS" "$TMP/ok.json"
  echo '{"UC-1":{"path":"tests/a.test.ts","sha256":"x"}}' > "$TMP/missing.json"
  _run "untested-uc" "FAIL" "$TMP/missing.json"
  echo '{"UC-1":{"path":"a","sha256":"x"},"UC-2":{"path":"b","sha256":"y"},"UC-9":{"path":"c","sha256":"z"}}' > "$TMP/orphan.json"
  _run "orphan-test" "FAIL" "$TMP/orphan.json"
  echo '{"tests/a.test.ts":"x"}' > "$TMP/flat.json"
  _run "flat-manifest" "FAIL" "$TMP/flat.json"
  echo '{"foo":{"path":"a","sha256":"x"}}' > "$TMP/nonuc.json"
  _run "non-uc-key" "FAIL" "$TMP/nonuc.json"
  _run "no-manifest" "SKIP" "$TMP/does-not-exist.json"
  printf 'self-test: %d pass, %d fail\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
}

[ "${1:-}" = "--self-test" ] && { self_test; exit $?; }

RUN_ID="${RUN_ID:-}"
[ -z "$RUN_ID" ] && { echo "post-red-uc-coverage: RUN_ID unset — skip"; exit 0; }
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
[ -d "$STATE_DIR" ] || { echo "post-red-uc-coverage: STATE_DIR missing — skip"; exit 0; }

OUT=$(check "$STATE_DIR/test-contract.md" "$STATE_DIR/red-test-manifest.json"); RC=$?
VERDICT="${OUT%%|*}"; DETAILS="${OUT#*|}"
echo "post-red-uc-coverage: $VERDICT (${DETAILS%$'\n'})"
if [ "$VERDICT" = "FAIL" ]; then
  STORY="$STATE_DIR/STORY.md"
  [ -f "$STORY" ] && {
    printf '\n## gate-B uc-coverage — post-red-uc-coverage — %s\n\nFAIL — %s\nRe-spawn fresh red to align tests with the contract.\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${DETAILS%$'\n'}" >> "$STORY"
  }
fi
exit "$RC"
