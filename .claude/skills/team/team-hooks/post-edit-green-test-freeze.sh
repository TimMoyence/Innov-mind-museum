#!/bin/bash
# post-edit-green-test-freeze.sh — UFR-022 frozen-test enforcement.
#
# Runs after every Edit/Write during phase 4 (Green). Recomputes sha256 of every
# test file declared in red-test-manifest.json. Mismatch = exit 1 STOP + escalate.
#
# Phase 3 (Red) writes:
#   team-state/$RUN_ID/red-test-manifest.json = {"<test-file-path>": "<sha256>", ...}
#
# Phase 4 (Green) MUST NOT modify any path listed there. If the agent thinks a
# test is wrong, it MUST emit BLOCK-TEST-WRONG <file>:<line> <reason> — re-spawn
# fresh phase 3 instead.
#
# Usage: RUN_ID=YYYY-MM-DD-slug .claude/skills/team/team-hooks/post-edit-green-test-freeze.sh
# Exits 0 PASS | 1 FAIL (mismatch detected).
# Self-test: --self-test runs scenarios and exits 0/1.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
RUN_ID="${RUN_ID:-}"
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
STATE_FILE="$STATE_DIR/state.json"
MANIFEST="$STATE_DIR/red-test-manifest.json"

sha256_of() {
  # Cross-platform sha256 (BSD/macOS shasum -a 256 || Linux sha256sum)
  if command -v sha256sum &>/dev/null; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    echo "post-edit-green-test-freeze: no sha256 tool found" >&2
    return 2
  fi
}

self_test() {
  echo "post-edit-green-test-freeze self-test"
  local TMP
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' RETURN
  local PASS=0 FAIL=0

  # Scenario 1: manifest matches (PASS)
  echo "describe('foo', () => it('a', () => expect(1).toBe(2)));" > "$TMP/a.test.ts"
  local h
  h=$(sha256_of "$TMP/a.test.ts")
  echo "{\"$TMP/a.test.ts\":\"$h\"}" > "$TMP/manifest.json"

  if MANIFEST_OVERRIDE="$TMP/manifest.json" verify_with_manifest "$TMP/manifest.json"; then
    echo "  PASS  matching-hash (no mismatch detected)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  matching-hash (false-positive mismatch)"
    FAIL=$((FAIL + 1))
  fi

  # Scenario 2: file modified after manifest (FAIL)
  echo "describe('foo', () => it('a', () => expect(1).toBe(1)));" > "$TMP/a.test.ts"
  if MANIFEST_OVERRIDE="$TMP/manifest.json" verify_with_manifest "$TMP/manifest.json"; then
    echo "  FAIL  hash-mismatch (missed the modification)"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS  hash-mismatch (correctly detected)"
    PASS=$((PASS + 1))
  fi

  # Scenario 3: file deleted after manifest (FAIL)
  rm "$TMP/a.test.ts"
  if MANIFEST_OVERRIDE="$TMP/manifest.json" verify_with_manifest "$TMP/manifest.json"; then
    echo "  FAIL  file-deleted (missed the deletion)"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS  file-deleted (correctly detected as missing)"
    PASS=$((PASS + 1))
  fi

  # Scenario 4: UC-keyed manifest form (UFR-022 test-contract) matches (PASS)
  echo "describe('q', () => it('a', () => expect(1).toBe(2)));" > "$TMP/b.test.ts"
  local hb
  hb=$(sha256_of "$TMP/b.test.ts")
  echo "{\"UC-3\":{\"path\":\"$TMP/b.test.ts\",\"sha256\":\"$hb\"}}" > "$TMP/uc-manifest.json"
  if verify_with_manifest "$TMP/uc-manifest.json"; then
    echo "  PASS  uc-keyed-form (dual-format parsed)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  uc-keyed-form (dual-format not parsed)"
    FAIL=$((FAIL + 1))
  fi

  # Scenario 5: UC-keyed form, file modified (FAIL detected)
  echo "describe('q', () => it('a', () => expect(1).toBe(1)));" > "$TMP/b.test.ts"
  if verify_with_manifest "$TMP/uc-manifest.json"; then
    echo "  FAIL  uc-keyed-mismatch (missed the modification)"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS  uc-keyed-mismatch (correctly detected)"
    PASS=$((PASS + 1))
  fi

  echo "self-test: $PASS pass, $FAIL fail"
  [ "$FAIL" -eq 0 ]
}

verify_with_manifest() {
  local mfile="$1"
  local fail=0
  local entries
  # Dual-format (UFR-022 test-contract): the manifest is either the historical
  # flat form {"<path>": "<sha256>"} or the UC-keyed form
  # {"UC-<n>": {"path": "<path>", "sha256": "<sha256>"}}. Normalise both to
  # "<path>\t<sha256>" tuples — the freeze contract is per-path, key-agnostic.
  entries=$(jq -r 'to_entries[] | if (.value|type)=="object" then "\(.value.path)\t\(.value.sha256)" else "\(.key)\t\(.value)" end' "$mfile") || return 1
  while IFS=$'\t' read -r path expected; do
    [ -n "$path" ] || continue
    local actual
    if [ ! -f "$path" ]; then
      echo "  MISMATCH: $path (file missing — was deleted or moved)"
      fail=1
      continue
    fi
    actual=$(sha256_of "$path") || { echo "  ERROR  sha256 failed for $path"; fail=1; continue; }
    if [ "$actual" != "$expected" ]; then
      echo "  MISMATCH: $path"
      echo "    expected: $expected"
      echo "    actual:   $actual"
      fail=1
    fi
  done <<< "$entries"
  return $fail
}

[ "${1:-}" = "--self-test" ] && { self_test; exit $?; }

if [ -z "$RUN_ID" ]; then
  echo "post-edit-green-test-freeze: RUN_ID unset — skip"
  exit 0
fi

if [ ! -f "$MANIFEST" ]; then
  echo "post-edit-green-test-freeze: no red-test-manifest.json (phase 3 didn't produce one — micro path or pre-UFR-022 run) — skip"
  exit 0
fi

command -v jq &>/dev/null || { echo "post-edit-green-test-freeze: jq missing — skip"; exit 0; }

cd "$REPO_ROOT" || exit 1

if verify_with_manifest "$MANIFEST"; then
  echo "post-edit-green-test-freeze: PASS — all tests byte-identical to phase 3 manifest"
  exit 0
else
  echo "post-edit-green-test-freeze: FAIL — tests modified during Green phase (UFR-022 violation)"
  echo ""
  echo "  The Green phase MUST NOT modify any test file from phase 3 (Red)."
  echo "  If the Green agent believes a test is wrong, it MUST emit:"
  echo "    BLOCK-TEST-WRONG <file>:<line> <reason>"
  echo "  and refuse to touch the file. Dispatcher then re-spawns a fresh phase 3"
  echo "  with the finding."
  echo ""
  echo "  STOP run + escalate user. Run = blocked at phase 4."

  # Append to STORY.md
  STORY_FILE="$STATE_DIR/STORY.md"
  if [ -f "$STORY_FILE" ]; then
    {
      echo ""
      echo "## frozen-test — post-edit-green-test-freeze — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo ""
      echo "FAIL — tests modified during Green phase. UFR-022 frozen-test violation."
      echo "Run STOPPED + escalated to user."
    } >> "$STORY_FILE"
  fi

  exit 1
fi
