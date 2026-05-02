#!/bin/bash
# post-edit-lint.sh — scoped ESLint on files touched in current run + handoff brief size gate.
# Reads team-state/<RUN_ID>/state.json for scope. Exits 0 PASS, 1 FAIL.
#
# Usage (from dispatcher): RUN_ID=2026-05-02-foo .claude/skills/team/team-hooks/post-edit-lint.sh
#
# Concurrency: state.json writes serialize via mkdir-based compare-and-swap (atomic on POSIX).
# No `flock` dependency (macOS lacks it).

set -uo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
RUN_ID="${RUN_ID:-}"
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
STATE_FILE="$STATE_DIR/state.json"
HANDOFF_TOKEN_CAP=200          # V12 §2.4 contract
HANDOFF_CHAR_CAP=$((HANDOFF_TOKEN_CAP * 4))   # ~4 chars/token heuristic

if [ -z "$RUN_ID" ] || [ ! -f "$STATE_FILE" ]; then
  echo "post-edit-lint: RUN_ID unset or state.json missing — skip"
  exit 0
fi
command -v jq &>/dev/null || { echo "post-edit-lint: jq missing — skip"; exit 0; }

# --- Compare-and-swap state.json mutation -----------------------------------
# Atomic via mkdir lock + version-check loop. Rejects stale-version writes.
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
    # Stale-lock recovery
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
  echo "post-edit-lint: state lock timeout after ${max_attempts}*100ms" >&2
  return 1
}

# --- Determine touched files ------------------------------------------------
START_COMMIT=$(jq -r '.startCommit // "HEAD"' "$STATE_FILE" 2>/dev/null)
CHANGED=$( { cd "$REPO_ROOT" || exit 1; git diff --name-only "$START_COMMIT" 2>/dev/null; } | grep -E '\.(ts|tsx|js|jsx)$' || true)

# --- Lint scoped per-app ----------------------------------------------------
VERDICT="PASS"
FAILED=""

if [ -n "$CHANGED" ]; then
  BE_FILES=$(echo "$CHANGED" | grep '^museum-backend/' || true)
  FE_FILES=$(echo "$CHANGED" | grep '^museum-frontend/' || true)
  WEB_FILES=$(echo "$CHANGED" | grep '^museum-web/' || true)

  if [ -n "$BE_FILES" ]; then
    ( cd "$REPO_ROOT/museum-backend" && pnpm lint ) || { VERDICT="FAIL"; FAILED+="BE-lint; "; }
  fi
  if [ -n "$FE_FILES" ]; then
    ( cd "$REPO_ROOT/museum-frontend" && npm run lint ) || { VERDICT="FAIL"; FAILED+="FE-lint; "; }
  fi
  if [ -n "$WEB_FILES" ]; then
    ( cd "$REPO_ROOT/museum-web" && pnpm lint ) || { VERDICT="FAIL"; FAILED+="WEB-lint; "; }
  fi
fi

# --- Handoff brief size gate (V12 §2.4) -------------------------------------
HANDOFF_DIR="$STATE_DIR/handoffs"
OVERSIZED=""
if [ -d "$HANDOFF_DIR" ]; then
  for h in "$HANDOFF_DIR"/*.json; do
    [ -f "$h" ] || continue
    chars=$(wc -c < "$h" | tr -d ' ')
    if [ "$chars" -gt "$HANDOFF_CHAR_CAP" ] 2>/dev/null; then
      OVERSIZED+="$(basename "$h")=${chars}c; "
    fi
  done
fi
if [ -n "$OVERSIZED" ]; then
  VERDICT="FAIL"
  FAILED+="handoff-brief-oversize($OVERSIZED); "
fi

# --- Append gate verdict to state.json (atomic CAS) -------------------------
GATE_JSON=$(jq -n --arg verdict "$VERDICT" --arg details "$FAILED" \
  '{name: "lint", verdict: $verdict, ts: "PLACEHOLDER", details: $details}')

update_state '.gates = (.gates // []) + [($__gate | .ts = $__ts)]' \
  --argjson __gate "$GATE_JSON" || {
    echo "post-edit-lint: state update failed"
    exit 1
  }

if [ "$VERDICT" = "FAIL" ]; then
  echo "post-edit-lint: FAIL ($FAILED)"
  exit 1
fi
echo "post-edit-lint: PASS"
exit 0
