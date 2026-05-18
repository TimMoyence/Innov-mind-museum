#!/bin/bash
# pre-phase-pure-doc-check.sh — UFR-022 exemption check.
# Runs at Step 0 INIT. If the working tree + staged diff touches 0 files inside the
# applicative code globs (museum-backend/src/**, museum-frontend/{app,features,shared,components}/**,
# museum-web/src/**, or any tests dir), the entire 5-phase pipeline is skipped.
#
# Usage (dispatcher): RUN_ID=YYYY-MM-DD-slug .claude/skills/team/team-hooks/pre-phase-pure-doc-check.sh
#
# Exits 0 PASS (run pipeline) | 0 SKIP (run goes direct to Step 9 finalize, dispatcher reads $RUN_ID/pure-doc-skip.marker).
# Self-test: --self-test runs scenarios and exits 0/1.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
RUN_ID="${RUN_ID:-}"
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
STATE_FILE="$STATE_DIR/state.json"
MARKER_FILE="$STATE_DIR/pure-doc-skip.marker"

# Applicative code globs (one regex per app, joined as alternation)
CODE_GLOB='^(museum-backend/src/|museum-frontend/(app|features|shared|components)/|museum-web/src/|tests/|museum-backend/tests/|museum-frontend/__tests__/|museum-web/e2e/)'

self_test() {
  echo "pre-phase-pure-doc-check self-test"
  local PASS=0 FAIL=0
  test_case() {
    local name="$1" input="$2" want="$3"
    local got
    got=$(echo "$input" | grep -E "$CODE_GLOB" || true)
    if [ -z "$got" ] && [ "$want" = "skip" ]; then
      echo "  PASS  $name (skip — no code touched)"
      PASS=$((PASS + 1))
    elif [ -n "$got" ] && [ "$want" = "run" ]; then
      echo "  PASS  $name (run — code touched: $got)"
      PASS=$((PASS + 1))
    else
      echo "  FAIL  $name (want=$want got=[$got])"
      FAIL=$((FAIL + 1))
    fi
  }
  test_case "pure-doc-only" "README.md
CLAUDE.md
docs/foo.md" "skip"
  test_case "BE-src-touched" "museum-backend/src/modules/auth/foo.ts" "run"
  test_case "FE-feature-touched" "museum-frontend/features/chat/ui/ChatScreen.tsx" "run"
  test_case "WEB-app-touched" "museum-web/src/app/page.tsx" "run"
  test_case "tests-touched" "museum-backend/tests/unit/foo.test.ts" "run"
  test_case "mixed-docs-and-code" "docs/foo.md
museum-backend/src/x.ts" "run"
  test_case "config-only" ".gitignore
package.json
.github/workflows/ci.yml" "skip"
  test_case "lib-docs-LESSONS-only" "lib-docs/react-native/LESSONS.md" "skip"
  echo "self-test: $PASS pass, $FAIL fail"
  [ "$FAIL" -eq 0 ]
}

[ "${1:-}" = "--self-test" ] && { self_test; exit $?; }

if [ -z "$RUN_ID" ] || [ ! -d "$STATE_DIR" ]; then
  echo "pre-phase-pure-doc-check: RUN_ID unset or state dir missing — skip"
  exit 0
fi
command -v jq &>/dev/null || { echo "pre-phase-pure-doc-check: jq missing — exit 0 (lenient)"; exit 0; }

# Collect diff candidate set : working tree + staged changes (the run hasn't committed yet)
cd "$REPO_ROOT" || exit 1
WORKING_TREE=$(git diff --name-only HEAD 2>/dev/null || true)
STAGED=$(git diff --name-only --cached 2>/dev/null || true)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)
DIFF_SET=$(printf '%s\n%s\n%s\n' "$WORKING_TREE" "$STAGED" "$UNTRACKED" | sort -u | grep -v '^$' || true)

CODE_TOUCHED=$(echo "$DIFF_SET" | grep -E "$CODE_GLOB" || true)

if [ -z "$CODE_TOUCHED" ]; then
  # Pure-doc edit OR no diff at all.
  if [ -z "$DIFF_SET" ]; then
    echo "pre-phase-pure-doc-check: empty diff — refusing to dispatch."
    echo "If you want to start a new run, ensure your changes are present in working tree or staged."
    exit 1
  fi
  echo "pre-phase-pure-doc-check: pure-doc edit detected (no applicative code touched). Skipping pipeline."
  echo "Touched non-code files:"
  echo "$DIFF_SET" | sed 's/^/  /'
  mkdir -p "$STATE_DIR"
  echo "{\"skippedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"reason\":\"pure-doc-edit\",\"touched\":$(echo "$DIFF_SET" | jq -R . | jq -s .)}" > "$MARKER_FILE"
  # Append to STORY.md if present
  STORY_FILE="$STATE_DIR/STORY.md"
  if [ -f "$STORY_FILE" ]; then
    {
      echo ""
      echo "## pure-doc-skip — dispatcher — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo ""
      echo "Pipeline skipped per UFR-022 — diff = 0 applicative code files."
      echo ""
      echo "Touched files:"
      echo "$DIFF_SET" | sed 's/^/- /'
    } >> "$STORY_FILE"
  fi
  exit 0
fi

echo "pre-phase-pure-doc-check: applicative code touched — proceed with full pipeline."
echo "$CODE_TOUCHED" | head -20 | sed 's/^/  /'
exit 0
