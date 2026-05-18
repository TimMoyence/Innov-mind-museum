#!/bin/bash
# pre-phase-doc-reference-check.sh — UFR-022 verifier assertion.
#
# Runs at Step 6 (Verify) after Green phase completes. Cross-checks that the
# agent outputs (red + green) declared `libDocsConsulted[]` covering every
# non-dev-only lib imported by the diff. Missing entry = agent skipped the
# obligation = BLOCK + re-spawn the offending phase.
#
# Inputs read :
#   team-state/$RUN_ID/state.json — agents[].libDocsConsulted[]
#   team-state/$RUN_ID/doc-refresh-queue.json — libs in scope (excludes dev-only)
#   lib-docs/INDEX.json — current patternsSha256 per lib (for drift detection)
#
# Usage: RUN_ID=YYYY-MM-DD-slug .claude/skills/team/team-hooks/pre-phase-doc-reference-check.sh
# Exits 0 PASS | 1 BLOCK.
# Self-test: --self-test runs scenarios and exits 0/1.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
RUN_ID="${RUN_ID:-}"
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
STATE_FILE="$STATE_DIR/state.json"
QUEUE_FILE="$STATE_DIR/doc-refresh-queue.json"
INDEX_FILE="$REPO_ROOT/lib-docs/INDEX.json"

self_test() {
  echo "pre-phase-doc-reference-check self-test"
  local TMP PASS=0 FAIL=0
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' RETURN

  # Scenario 1 : all libs referenced (PASS)
  cat > "$TMP/state.json" <<'JSON'
{
  "agents": [
    { "name": "editor-red", "role": "editor", "phase": "red",
      "libDocsConsulted": [{"lib": "react-native", "patternsPath": "lib-docs/react-native/PATTERNS.md", "patternsSha256AtConsult": "abc123"}] },
    { "name": "editor-green", "role": "editor", "phase": "green",
      "libDocsConsulted": [{"lib": "react-native", "patternsPath": "lib-docs/react-native/PATTERNS.md", "patternsSha256AtConsult": "abc123"},
                            {"lib": "zod", "patternsPath": "lib-docs/zod/PATTERNS.md", "patternsSha256AtConsult": "def456"}] }
  ]
}
JSON
  echo '{"queue":[], "skipped":[{"lib":"react-native","reason":"fresh"},{"lib":"zod","reason":"fresh"}]}' > "$TMP/queue.json"
  echo '{"libs":{"react-native":{"patternsSha256":"abc123"},"zod":{"patternsSha256":"def456"}}}' > "$TMP/INDEX.json"
  if check_with_files "$TMP/state.json" "$TMP/queue.json" "$TMP/INDEX.json"; then
    echo "  PASS  all-referenced"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  all-referenced (false-positive block)"
    FAIL=$((FAIL + 1))
  fi

  # Scenario 2 : missing reference (FAIL)
  cat > "$TMP/state.json" <<'JSON'
{
  "agents": [
    { "name": "editor-green", "role": "editor", "phase": "green",
      "libDocsConsulted": [{"lib": "react-native", "patternsPath": "...", "patternsSha256AtConsult": "abc123"}] }
  ]
}
JSON
  echo '{"queue":[], "skipped":[{"lib":"react-native","reason":"fresh"},{"lib":"zod","reason":"fresh"}]}' > "$TMP/queue.json"
  if check_with_files "$TMP/state.json" "$TMP/queue.json" "$TMP/INDEX.json"; then
    echo "  FAIL  missing-zod (missed)"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS  missing-zod (correctly blocked)"
    PASS=$((PASS + 1))
  fi

  # Scenario 3 : hash drift between consult and current INDEX (FAIL)
  cat > "$TMP/state.json" <<'JSON'
{
  "agents": [
    { "name": "editor-green", "role": "editor", "phase": "green",
      "libDocsConsulted": [{"lib": "react-native", "patternsPath": "...", "patternsSha256AtConsult": "OLDHASH"},
                            {"lib": "zod",          "patternsPath": "...", "patternsSha256AtConsult": "def456"}] }
  ]
}
JSON
  if check_with_files "$TMP/state.json" "$TMP/queue.json" "$TMP/INDEX.json"; then
    echo "  FAIL  hash-drift (missed)"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS  hash-drift (correctly blocked)"
    PASS=$((PASS + 1))
  fi

  echo "self-test: $PASS pass, $FAIL fail"
  [ "$FAIL" -eq 0 ]
}

check_with_files() {
  local sf="$1" qf="$2" indf="$3"
  # All libs that should have been referenced: queue (refreshed) + skipped non-dev-only
  local required
  required=$(jq -r '
    ([.queue[]?.lib, .skipped[]? | select(.reason != "dev-only") | .lib]) | .[] | select(. != null)
  ' "$qf" 2>/dev/null | sort -u)
  if [ -z "$required" ]; then
    return 0 # nothing required
  fi

  local fail=0
  while IFS= read -r lib; do
    [ -z "$lib" ] && continue
    # Was the lib referenced by at least one red/green agent ?
    local refs
    refs=$(jq -r --arg l "$lib" '
      [.agents[]? | select(.phase == "red" or .phase == "green") | .libDocsConsulted[]? | select(.lib == $l)] | length
    ' "$sf" 2>/dev/null)
    if [ "${refs:-0}" -eq 0 ]; then
      echo "  MISSING reference: lib=$lib not in any red/green libDocsConsulted[]"
      fail=1
      continue
    fi
    # Hash drift check : agent's consult hash must match current INDEX.json
    if [ -f "$indf" ]; then
      local current_hash declared_hash
      current_hash=$(jq -r --arg l "$lib" '.libs[$l].patternsSha256 // ""' "$indf")
      declared_hash=$(jq -r --arg l "$lib" '
        [.agents[]? | select(.phase == "red" or .phase == "green") | .libDocsConsulted[]? | select(.lib == $l) | .patternsSha256AtConsult] | last // ""
      ' "$sf")
      if [ -n "$current_hash" ] && [ -n "$declared_hash" ] && [ "$current_hash" != "$declared_hash" ]; then
        echo "  HASH DRIFT for $lib : declared=$declared_hash current=$current_hash (re-fresh needed or agent consulted a stale snapshot)"
        fail=1
      fi
    fi
  done <<< "$required"
  return $fail
}

[ "${1:-}" = "--self-test" ] && { self_test; exit $?; }

if [ -z "$RUN_ID" ] || [ ! -f "$STATE_FILE" ]; then
  echo "pre-phase-doc-reference-check: RUN_ID unset or state.json missing — skip"
  exit 0
fi
command -v jq &>/dev/null || { echo "pre-phase-doc-reference-check: jq missing — skip"; exit 0; }
[ -f "$QUEUE_FILE" ] || { echo "pre-phase-doc-reference-check: no queue file — skip"; exit 0; }

if check_with_files "$STATE_FILE" "$QUEUE_FILE" "$INDEX_FILE"; then
  echo "pre-phase-doc-reference-check: PASS — all in-scope libs referenced + hash-consistent"
  exit 0
else
  echo ""
  echo "pre-phase-doc-reference-check: FAIL — UFR-022 lib-docs reference proof missing or stale."
  echo "Action : re-spawn the offending phase (red or green) with explicit instruction to consult"
  echo "          lib-docs/<lib>/PATTERNS.md for every imported library."
  exit 1
fi
