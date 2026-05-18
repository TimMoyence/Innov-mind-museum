#!/bin/bash
# pre-phase-doc-freshness.sh — UFR-022 lib-docs freshness gate.
#
# Runs before phase 3 (Red), 4 (Green), and 5 (Review). Parses imports from the
# current diff, then for each non-dev-only lib does a 3-way staleness check :
#   - INDEX.json.libs[lib].version vs resolved package.json version
#   - INDEX.json.libs[lib].fetched < (now - 14d)
#   - lib-docs/<lib>/PATTERNS.md exists locally
#
# Writes the refresh queue to team-state/$RUN_ID/doc-refresh-queue.json. The
# dispatcher then spawns doc-fetcher + doc-curator per queued lib. WebSearch
# fail → WARN + use stale + tag (per UFR-022 §6.6), never BLOCK.
#
# Usage: RUN_ID=YYYY-MM-DD-slug .claude/skills/team/team-hooks/pre-phase-doc-freshness.sh
# Exits 0 always (this is informational, not a gate that BLOCKs).
# Self-test: --self-test runs scenarios and exits 0/1.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
RUN_ID="${RUN_ID:-}"
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
INDEX_FILE="$REPO_ROOT/lib-docs/INDEX.json"
LIB_DOCS_DIR="$REPO_ROOT/lib-docs"
QUEUE_FILE="$STATE_DIR/doc-refresh-queue.json"
STALE_THRESHOLD_DAYS=14

# ---------- Lib detection from staged diff ----------

extract_imports_from_diff() {
  # Parse imports from working tree + staged code files.
  # Captures both `import X from 'pkg'` and `import 'pkg'` and `from "pkg"`.
  # Skips local imports (./../@/@modules/etc.).
  cd "$REPO_ROOT" || return 1
  local files
  files=$( {
    git diff --name-only HEAD 2>/dev/null
    git diff --name-only --cached 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  } | sort -u | grep -E '\.(ts|tsx|js|jsx|cjs|mjs)$' || true)

  if [ -z "$files" ]; then
    return 0
  fi

  local libs=""
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    # Match import/from statements with quoted paths
    while IFS= read -r line; do
      # Skip local imports
      if echo "$line" | grep -qE "['\"](\\./|\\.\\./|@/|@src/|@modules/|@shared/|@data/)"; then
        continue
      fi
      # Extract the bare package name (handles @scope/name)
      local lib
      lib=$(echo "$line" | sed -nE "s/.*['\"]([^'\"]+)['\"].*/\1/p")
      [ -z "$lib" ] && continue
      # Normalize : @scope/name keeps both; otherwise take the first segment
      if [[ "$lib" =~ ^@[^/]+/[^/]+ ]]; then
        lib=$(echo "$lib" | sed -nE 's|^(@[^/]+/[^/]+).*|\1|p')
      else
        lib=$(echo "$lib" | sed -nE 's|^([^/]+).*|\1|p')
      fi
      [ -z "$lib" ] && continue
      libs+="$lib"$'\n'
    done < <(grep -hE "^(import|export).*['\"][^'\"]+['\"]" "$f" 2>/dev/null || true; grep -hE "from\\s+['\"][^'\"]+['\"]" "$f" 2>/dev/null || true)
  done <<< "$files"

  echo "$libs" | sort -u | grep -v '^$' || true
}

is_dev_only() {
  local lib="$1"
  jq -e --arg l "$lib" '.devOnlyLibs[] | select(. == $l)' "$INDEX_FILE" &>/dev/null
}

resolved_version_for() {
  # Try to resolve the version installed for this lib by checking package.json
  # files (root + per-app). Returns the first match found; "unknown" otherwise.
  local lib="$1"
  for pkg in "$REPO_ROOT/package.json" \
             "$REPO_ROOT/museum-backend/package.json" \
             "$REPO_ROOT/museum-frontend/package.json" \
             "$REPO_ROOT/museum-web/package.json" \
             "$REPO_ROOT/packages/musaium-shared/package.json"; do
    [ -f "$pkg" ] || continue
    local v
    v=$(jq -r --arg l "$lib" '
      (.dependencies // {})[$l] // (.devDependencies // {})[$l] // (.peerDependencies // {})[$l] // empty
    ' "$pkg" 2>/dev/null || true)
    if [ -n "$v" ]; then
      echo "$v"
      return 0
    fi
  done
  echo "unknown"
}

is_stale() {
  local fetched="$1"
  [ -z "$fetched" ] || [ "$fetched" = "null" ] && return 0
  # ISO 8601 → epoch. Cross-platform : try GNU date first, then BSD.
  local fetched_epoch now_epoch diff_days
  if fetched_epoch=$(date -d "$fetched" +%s 2>/dev/null); then
    : # GNU
  elif fetched_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$fetched" +%s 2>/dev/null); then
    : # BSD/macOS
  else
    return 0 # parsing failed → treat as stale
  fi
  now_epoch=$(date -u +%s)
  diff_days=$(( (now_epoch - fetched_epoch) / 86400 ))
  [ "$diff_days" -gt "$STALE_THRESHOLD_DAYS" ]
}

self_test() {
  echo "pre-phase-doc-freshness self-test"
  local PASS=0 FAIL=0

  # Test is_stale
  local fresh stale
  fresh=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  if is_stale ""; then
    echo "  PASS  is_stale empty → true"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  is_stale empty → false (want true)"
    FAIL=$((FAIL + 1))
  fi
  if is_stale "$fresh"; then
    echo "  FAIL  is_stale just-now → true (want false)"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS  is_stale just-now → false"
    PASS=$((PASS + 1))
  fi
  # 30 days ago
  if date -u -d "30 days ago" +"%Y-%m-%dT%H:%M:%SZ" &>/dev/null; then
    stale=$(date -u -d "30 days ago" +"%Y-%m-%dT%H:%M:%SZ")
  else
    stale=$(date -u -v-30d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "2026-04-01T00:00:00Z")
  fi
  if is_stale "$stale"; then
    echo "  PASS  is_stale 30d-ago → true"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  is_stale 30d-ago → false (want true)"
    FAIL=$((FAIL + 1))
  fi

  # Test resolved_version_for : pick a lib known to exist in our package.json
  local v
  v=$(resolved_version_for "typescript")
  if [ -n "$v" ] && [ "$v" != "unknown" ]; then
    echo "  PASS  resolved_version_for typescript → $v"
    PASS=$((PASS + 1))
  else
    echo "  WARN  resolved_version_for typescript → unknown (no root package.json or typescript not declared)"
  fi

  echo "self-test: $PASS pass, $FAIL fail"
  [ "$FAIL" -eq 0 ]
}

[ "${1:-}" = "--self-test" ] && { self_test; exit $?; }

if [ -z "$RUN_ID" ] || [ ! -d "$STATE_DIR" ]; then
  echo "pre-phase-doc-freshness: RUN_ID unset or state dir missing — skip"
  exit 0
fi
command -v jq &>/dev/null || { echo "pre-phase-doc-freshness: jq missing — skip"; exit 0; }
[ -f "$INDEX_FILE" ] || { echo "pre-phase-doc-freshness: lib-docs/INDEX.json missing — skip (bootstrap)"; exit 0; }

LIBS=$(extract_imports_from_diff)
if [ -z "$LIBS" ]; then
  echo "pre-phase-doc-freshness: no library imports detected in diff — skip"
  echo '{"queue":[],"skipped":[]}' > "$QUEUE_FILE"
  exit 0
fi

QUEUE_JSON='{"queue":[],"skipped":[]}'
while IFS= read -r lib; do
  [ -z "$lib" ] && continue
  if is_dev_only "$lib"; then
    QUEUE_JSON=$(echo "$QUEUE_JSON" | jq --arg l "$lib" '.skipped += [{lib: $l, reason: "dev-only"}]')
    continue
  fi
  current_version=$(resolved_version_for "$lib")
  cached_version=$(jq -r --arg l "$lib" '.libs[$l].version // ""' "$INDEX_FILE")
  cached_fetched=$(jq -r --arg l "$lib" '.libs[$l].fetched // ""' "$INDEX_FILE")
  patterns_path="$LIB_DOCS_DIR/$lib/PATTERNS.md"

  REASONS=""
  if [ "$current_version" != "unknown" ] && [ "$cached_version" != "" ] && [ "$current_version" != "$cached_version" ]; then
    REASONS+="version-drift($cached_version→$current_version) "
  fi
  if [ -z "$cached_fetched" ] || [ "$cached_fetched" = "null" ]; then
    REASONS+="never-fetched "
  elif is_stale "$cached_fetched"; then
    REASONS+="stale(>${STALE_THRESHOLD_DAYS}d) "
  fi
  if [ ! -f "$patterns_path" ]; then
    REASONS+="patterns-missing-local "
  fi

  if [ -n "$REASONS" ]; then
    QUEUE_JSON=$(echo "$QUEUE_JSON" | jq --arg l "$lib" --arg v "$current_version" --arg r "$REASONS" \
      '.queue += [{lib: $l, currentVersion: $v, reason: ($r | rtrimstr(" "))}]')
  else
    QUEUE_JSON=$(echo "$QUEUE_JSON" | jq --arg l "$lib" '.skipped += [{lib: $l, reason: "fresh-and-versioned"}]')
  fi
done <<< "$LIBS"

echo "$QUEUE_JSON" > "$QUEUE_FILE"

QUEUE_COUNT=$(echo "$QUEUE_JSON" | jq '.queue | length')
SKIPPED_COUNT=$(echo "$QUEUE_JSON" | jq '.skipped | length')
echo "pre-phase-doc-freshness: $QUEUE_COUNT libs to refresh, $SKIPPED_COUNT skipped (dev-only or fresh)"
echo "queue written to $QUEUE_FILE"
exit 0
