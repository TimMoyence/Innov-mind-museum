#!/bin/bash
# pre-complete-verify.sh — final gate before dispatcher marks state `completed`.
# - Runs scoped tests (BE/FE/WEB selon scope).
# - Verifies STORY.md append-only contract via per-phase sha256 chain.
# - Records all verdicts to state.json via CAS pattern.
# Exits 0 PASS (allow completion), 1 FAIL (block).

set -uo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
RUN_ID="${RUN_ID:-}"
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
STATE_FILE="$STATE_DIR/state.json"
STORY_FILE="$STATE_DIR/STORY.md"

if [ -z "$RUN_ID" ] || [ ! -f "$STATE_FILE" ]; then
  echo "pre-complete-verify: RUN_ID unset or state.json missing — skip"
  exit 0
fi
command -v jq &>/dev/null || { echo "pre-complete-verify: jq missing — skip"; exit 0; }

update_state() {
  local jq_expr="$1"; shift
  local lock_dir="$STATE_FILE.lock.d"
  local attempt=0
  local max_attempts=30
  while [ "$attempt" -lt "$max_attempts" ]; do
    if mkdir "$lock_dir" 2>/dev/null; then
      echo $$ > "$lock_dir/owner"
      local cur_v
      cur_v=$(jq -r '.version' "$STATE_FILE" 2>/dev/null || echo "0")
      local new_v=$((cur_v + 1))
      local now
      now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      if jq "$@" --argjson __v "$new_v" --arg __ts "$now" \
          "(.version = \$__v | .updatedAt = \$__ts) | $jq_expr" \
          "$STATE_FILE" > "$STATE_FILE.tmp"; then
        mv "$STATE_FILE.tmp" "$STATE_FILE"
        rm -rf "$lock_dir"
        return 0
      fi
      rm -f "$STATE_FILE.tmp"
      rm -rf "$lock_dir"
      return 1
    fi
    if [ -f "$lock_dir/owner" ]; then
      local pid
      pid=$(cat "$lock_dir/owner" 2>/dev/null || echo "")
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
        rm -rf "$lock_dir"
        continue
      fi
    fi
    attempt=$((attempt + 1))
    sleep 0.1
  done
  return 1
}

VERDICT="PASS"
FAILED=""

# --- STORY.md append-only check via per-phase sha256 ------------------------
# Compute sha256 of each "## <phase>" section. Compare to state.json.storyHashes.
# A prior phase whose hash changed = history rewrite = FAIL.
if [ -f "$STORY_FILE" ]; then
  PHASE_HASHES_JSON=$(awk '
    /^## / {
      if (cur_section != "") { print cur_section "\t" buf; }
      cur_section = $0; buf = $0 "\n"; next
    }
    { buf = buf $0 "\n" }
    END { if (cur_section != "") print cur_section "\t" buf; }
  ' "$STORY_FILE" | while IFS=$'\t' read -r section content; do
    h=$(printf '%s' "$content" | shasum -a 256 | awk '{print $1}')
    # JSON-encode the section header as a key
    key=$(printf '%s' "$section" | jq -Rs .)
    printf '%s: "%s",\n' "$key" "$h"
  done | sed '$ s/,$//' | awk 'BEGIN{print "{"} {print} END{print "}"}')

  STORED_HASHES=$(jq -r '.storyHashes // {}' "$STATE_FILE")
  # For every previously-stored phase: if current hash differs, FAIL.
  while IFS= read -r phase; do
    [ -z "$phase" ] && continue
    stored=$(echo "$STORED_HASHES" | jq -r --arg p "$phase" '.[$p] // empty')
    current=$(echo "$PHASE_HASHES_JSON" | jq -r --arg p "$phase" '.[$p] // empty')
    if [ -n "$stored" ] && [ -n "$current" ] && [ "$stored" != "$current" ]; then
      VERDICT="FAIL"
      FAILED+="STORY.md rewrite detected in phase '${phase}'; "
    fi
  done < <(echo "$STORED_HASHES" | jq -r 'keys[]')

  # Persist updated phase hashes (additive: new sections welcome, prior unchanged).
  update_state '.storyHashes = ($__hashes | fromjson)' \
    --arg __hashes "$PHASE_HASHES_JSON" || true
fi

# --- Scoped test runs -------------------------------------------------------
START_COMMIT=$(jq -r '.startCommit // "HEAD"' "$STATE_FILE" 2>/dev/null)
CHANGED=$( { cd "$REPO_ROOT" || exit 1; git diff --name-only "$START_COMMIT" 2>/dev/null; } || true)

if echo "$CHANGED" | grep -q '^museum-backend/'; then
  ( cd "$REPO_ROOT/museum-backend" && pnpm test ) || { VERDICT="FAIL"; FAILED+="BE-tests; "; }
fi
if echo "$CHANGED" | grep -q '^museum-frontend/'; then
  ( cd "$REPO_ROOT/museum-frontend" && npm test ) || { VERDICT="FAIL"; FAILED+="FE-tests; "; }
fi
if echo "$CHANGED" | grep -q '^museum-web/'; then
  ( cd "$REPO_ROOT/museum-web" && pnpm test ) || { VERDICT="FAIL"; FAILED+="WEB-tests; "; }
fi

# --- Record gate verdict ----------------------------------------------------
GATE_JSON=$(jq -n --arg verdict "$VERDICT" --arg details "$FAILED" \
  '{name: "tests", verdict: $verdict, ts: "PLACEHOLDER", details: $details}')
update_state '.gates = (.gates // []) + [($__gate | .ts = $__ts)]' \
  --argjson __gate "$GATE_JSON" || { echo "pre-complete-verify: state update failed"; exit 1; }

if [ "$VERDICT" = "FAIL" ]; then
  echo "pre-complete-verify: FAIL ($FAILED)"
  exit 1
fi
echo "pre-complete-verify: PASS"
exit 0
