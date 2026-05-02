#!/bin/bash
# post-edit-typecheck.sh — scoped tsc --noEmit on apps touched in current run.
# Mirrors post-edit-lint.sh (same CAS pattern). Exits 0 PASS, 1 FAIL.
#
# Usage: RUN_ID=2026-05-02-foo .claude/skills/team/team-hooks/post-edit-typecheck.sh

set -uo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
RUN_ID="${RUN_ID:-}"
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
STATE_FILE="$STATE_DIR/state.json"

if [ -z "$RUN_ID" ] || [ ! -f "$STATE_FILE" ]; then
  echo "post-edit-typecheck: RUN_ID unset or state.json missing — skip"
  exit 0
fi
command -v jq &>/dev/null || { echo "post-edit-typecheck: jq missing — skip"; exit 0; }

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

START_COMMIT=$(jq -r '.startCommit // "HEAD"' "$STATE_FILE" 2>/dev/null)
CHANGED=$( { cd "$REPO_ROOT" || exit 1; git diff --name-only "$START_COMMIT" 2>/dev/null; } | grep -E '\.(ts|tsx)$' || true)

VERDICT="PASS"
FAILED=""

if [ -n "$CHANGED" ]; then
  if echo "$CHANGED" | grep -q '^museum-backend/'; then
    ( cd "$REPO_ROOT/museum-backend" && npx tsc --noEmit ) || { VERDICT="FAIL"; FAILED+="BE-tsc; "; }
  fi
  if echo "$CHANGED" | grep -q '^museum-frontend/'; then
    ( cd "$REPO_ROOT/museum-frontend" && npx tsc --noEmit ) || { VERDICT="FAIL"; FAILED+="FE-tsc; "; }
  fi
  if echo "$CHANGED" | grep -q '^museum-web/'; then
    ( cd "$REPO_ROOT/museum-web" && npx tsc --noEmit ) || { VERDICT="FAIL"; FAILED+="WEB-tsc; "; }
  fi
fi

GATE_JSON=$(jq -n --arg verdict "$VERDICT" --arg details "$FAILED" \
  '{name: "typecheck", verdict: $verdict, ts: "PLACEHOLDER", details: $details}')
update_state '.gates = (.gates // []) + [($__gate | .ts = $__ts)]' \
  --argjson __gate "$GATE_JSON" || { echo "post-edit-typecheck: state update failed"; exit 1; }

if [ "$VERDICT" = "FAIL" ]; then
  echo "post-edit-typecheck: FAIL ($FAILED)"
  exit 1
fi
echo "post-edit-typecheck: PASS"
exit 0
