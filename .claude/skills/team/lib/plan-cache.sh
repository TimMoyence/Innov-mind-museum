#!/bin/bash
# plan-cache.sh — Agentic Plan Caching (APC) helper for /team architect phase.
# V12 §6 + arxiv 2506.14852: fingerprint-keyed reuse of past Spec Kit outputs.
# Reuse = -50% cost, -27% latency vs cold plan.
#
# Subcommands:
#   fingerprint <mode> <scope> <touched_modules_csv> <problem_statement>
#   lookup <fingerprint>            → prints matching run_id + paths or empty
#   insert <fingerprint> <run_id>   → records an entry
#   bump <fingerprint>              → increment hits + update last_used
#   prune                            → LRU over 30 + age > 90d (Tech Lead only)
#
# Storage: .claude/skills/team/team-knowledge/plan-cache.json

set -uo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
CACHE_FILE="$REPO_ROOT/.claude/skills/team/team-knowledge/plan-cache.json"
LOCK_DIR="$CACHE_FILE.lock.d"

require_jq() {
  command -v jq &>/dev/null || { echo "plan-cache: jq missing" >&2; exit 1; }
}

# Atomic CAS — same pattern as team-hooks/post-edit-lint.sh.
update_cache() {
  local jq_expr="$1"; shift
  local attempt=0
  local max_attempts=30
  while [ "$attempt" -lt "$max_attempts" ]; do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      echo $$ > "$LOCK_DIR/owner"
      if jq "$@" "$jq_expr" "$CACHE_FILE" > "$CACHE_FILE.tmp"; then
        mv "$CACHE_FILE.tmp" "$CACHE_FILE"
        rm -rf "$LOCK_DIR"
        return 0
      fi
      rm -f "$CACHE_FILE.tmp"
      rm -rf "$LOCK_DIR"
      return 1
    fi
    if [ -f "$LOCK_DIR/owner" ]; then
      local pid
      pid=$(cat "$LOCK_DIR/owner" 2>/dev/null || echo "")
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
        rm -rf "$LOCK_DIR"
        continue
      fi
    fi
    attempt=$((attempt + 1))
    sleep 0.1
  done
  echo "plan-cache: lock timeout" >&2
  return 1
}

# fingerprint <mode> <scope> <touched_modules_csv> <problem_statement>
# → prints sha256 hex
fingerprint_task() {
  local mode="$1"
  local scope="$2"
  local modules="$3"   # comma-separated, will be sorted + de-duped
  local problem="$4"

  # Normalize: lowercase, sort modules, collapse whitespace in problem.
  local norm_modules
  norm_modules=$(echo "$modules" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | sort -u | tr '\n' ',' | sed 's/,$//')
  local norm_problem
  norm_problem=$(echo "$problem" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' ' | sed 's/^ *//;s/ *$//')

  printf '%s|%s|%s|%s' \
    "$(echo "$mode" | tr '[:upper:]' '[:lower:]')" \
    "$(echo "$scope" | tr '[:upper:]' '[:lower:]')" \
    "$norm_modules" \
    "$norm_problem" \
    | shasum -a 256 | awk '{print $1}'
}

# lookup <fingerprint> → prints JSON entry (or empty)
lookup() {
  require_jq
  local fp="$1"
  jq -c --arg fp "$fp" '.entries[] | select(.fingerprint == $fp)' "$CACHE_FILE" 2>/dev/null || true
}

# insert <fingerprint> <run_id>
# → adds entry with paths derived from team-state/<run_id>/
insert() {
  require_jq
  local fp="$1"
  local run_id="$2"
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local entry
  entry=$(jq -n \
    --arg fp "$fp" \
    --arg rid "$run_id" \
    --arg now "$now" \
    '{
      fingerprint: $fp,
      run_id: $rid,
      spec: ("team-state/" + $rid + "/spec.md"),
      design: ("team-state/" + $rid + "/design.md"),
      tasks: ("team-state/" + $rid + "/tasks.md"),
      created_at: $now,
      last_used: $now,
      hits: 0,
      parent_run_id: null
    }')
  update_cache '.entries += [$__entry]' --argjson __entry "$entry"
}

# bump <fingerprint> — increment hits + update last_used
bump() {
  require_jq
  local fp="$1"
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  update_cache \
    '.entries |= map(if .fingerprint == $__fp then .hits += 1 | .last_used = $__now else . end)' \
    --arg __fp "$fp" --arg __now "$now"
}

# prune — LRU over 30 entries OR last_used > 90 days ago
prune() {
  require_jq
  local cutoff
  cutoff=$(date -u -v -90d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '90 days ago' +"%Y-%m-%dT%H:%M:%SZ")
  update_cache \
    '.entries |= ([.[] | select(.last_used > $__cutoff)] | sort_by(.last_used) | reverse | .[0:30])' \
    --arg __cutoff "$cutoff"
}

# Dispatch
case "${1:-}" in
  fingerprint) shift; fingerprint_task "$@" ;;
  lookup)      shift; lookup "$@" ;;
  insert)      shift; insert "$@" ;;
  bump)        shift; bump "$@" ;;
  prune)       prune ;;
  *)
    cat >&2 <<EOF
Usage: $0 <subcommand> <args>
  fingerprint <mode> <scope> <touched_modules_csv> <problem_statement>
  lookup <fingerprint>
  insert <fingerprint> <run_id>
  bump <fingerprint>
  prune
EOF
    exit 2
    ;;
esac
