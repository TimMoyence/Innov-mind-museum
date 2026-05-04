#!/bin/bash
# roadmap-rotate.sh — T1.6 ROADMAP_TEAM (auto-consolidation roadmap × /team).
#
# End-of-sprint rotation: archive current ROADMAP_PRODUCT.md + ROADMAP_TEAM.md,
# rewrite NOW section empty (drop content), promote NEXT body to NOW header,
# insert empty NEXT — TBD placeholder above LATER. Never auto-commit.
#
# Args:
#   --self-test                    — 4 inline scenarios on tmpdir git repo
#   --sprint-end YYYY-MM-DD        — override sprint end date (default today)
#
# Inputs (env, override only):
#   ROADMAP_PRODUCT_PATH           default docs/ROADMAP_PRODUCT.md
#   ROADMAP_TEAM_PATH              default docs/ROADMAP_TEAM.md
#   ROADMAP_ARCHIVE_DIR            default docs/archive/roadmaps
#   ROADMAP_ROTATE_REPO            default $REPO_ROOT (overridden in self-test)
#
# Exit:
#   0 — rotate succeeded (or all self-tests PASS)
#   2 — refused: dirty working tree on either ROADMAP file
#   1 — internal error or self-test FAIL

set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"

# ---------------------------------------------------------------------------
# Rotate one ROADMAP file in-place. Returns 0 on success, 1 on missing NEXT.
# ---------------------------------------------------------------------------
rotate_one() {
  local src="$1"
  if [ ! -f "$src" ]; then
    echo "roadmap-rotate: file not found: $src" >&2
    return 1
  fi
  if ! grep -qE '^## NOW' "$src"; then
    echo "roadmap-rotate: no '## NOW' section in $src — skipping" >&2
    return 1
  fi
  local has_next=0
  if grep -qE '^## NEXT' "$src"; then has_next=1; fi

  # Extract NEXT section (header + body) — empty string if missing.
  local next_section=""
  if [ "$has_next" -eq 1 ]; then
    next_section=$(awk '
      /^## NEXT/    { in_next=1; print; next }
      in_next && /^## / { exit }
      in_next       { print }
    ' "$src")
  fi

  # Build new NOW section: rename NEXT header → NOW header (preserve "— title").
  local new_now_section
  if [ -n "$next_section" ]; then
    new_now_section=$(printf '%s\n' "$next_section" | sed '1s/^## NEXT/## NOW/')
  else
    new_now_section="## NOW — TBD"
    echo "roadmap-rotate: WARN no NEXT body in $src, NOW left as TBD placeholder" >&2
  fi

  local tmp
  tmp=$(mktemp)

  # Pass multiline new_now via env var (awk -v rejects newlines on macOS).
  NEW_NOW="$new_now_section" awk '
    BEGIN { new_now = ENVIRON["NEW_NOW"] }
    state == "" && /^## NOW/ {
      state = "skip-now"
      print new_now
      print ""
      next
    }
    state == "skip-now" && /^## NEXT/ {
      state = "skip-next"
      next
    }
    state == "skip-now" && /^## / {
      print "## NEXT — TBD"
      print ""
      print
      state = "rest"
      next
    }
    state == "skip-now" { next }

    state == "skip-next" && /^## / {
      print "## NEXT — TBD"
      print ""
      print
      state = "rest"
      next
    }
    state == "skip-next" { next }

    { print }
  ' "$src" > "$tmp"

  mv "$tmp" "$src"
  return 0
}

run_main() {
  local sprint_end
  sprint_end=$(date -u +"%Y-%m-%d")
  while [ $# -gt 0 ]; do
    case "$1" in
      --sprint-end) sprint_end="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  local repo="${ROADMAP_ROTATE_REPO:-$REPO_ROOT}"
  local product="${ROADMAP_PRODUCT_PATH:-$repo/docs/ROADMAP_PRODUCT.md}"
  local team="${ROADMAP_TEAM_PATH:-$repo/docs/ROADMAP_TEAM.md}"
  local archive_dir="${ROADMAP_ARCHIVE_DIR:-$repo/docs/archive/roadmaps}"

  # R8 — refuse dirty tree on either roadmap.
  local dirty
  dirty=$( (cd "$repo" && git status --porcelain -- "${product#$repo/}" "${team#$repo/}" 2>/dev/null) || true)
  if [ -n "$dirty" ]; then
    echo "roadmap-rotate: dirty: refuse to rotate, working tree has uncommitted ROADMAP changes:" >&2
    echo "$dirty" >&2
    return 2
  fi

  # Archive — collide-safe suffix.
  local target="$archive_dir/$sprint_end"
  local suffix=2
  while [ -d "$target" ]; do
    target="$archive_dir/$sprint_end-$suffix"
    suffix=$((suffix + 1))
  done
  mkdir -p "$target"
  cp "$product" "$target/ROADMAP_PRODUCT.md" 2>/dev/null || true
  cp "$team"    "$target/ROADMAP_TEAM.md"    2>/dev/null || true

  rotate_one "$product"
  rotate_one "$team"

  echo "roadmap-rotate: archive=$target rotated=$(basename "$product"),$(basename "$team")" >&2
  return 0
}

# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------
run_self_test() {
  local fail=0
  local tmp
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN

  # Helper: build a fresh fixture pair in $1 dir.
  build_fixture() {
    local d="$1"
    cat > "$d/docs/ROADMAP_PRODUCT.md" <<'EOF'
# Product

## North Star

Stuff.

## NOW — Sprint A

- [ ] Active item A

## NEXT — Post-launch

- [ ] Future item N

## LATER — Q3+

- Big idea

## KILLED

- bad idea
EOF
    cat > "$d/docs/ROADMAP_TEAM.md" <<'EOF'
# Team

## NOW — Sprint A

- [ ] Active T1.1

## NEXT — Post-launch

- [ ] Future T2.1
- [ ] Future T2.2

## LATER

- big team idea

## KILLED

- nope
EOF
  }

  init_repo() {
    local d="$1"
    mkdir -p "$d/docs/archive/roadmaps"
    git -C "$d" init -q
    git -C "$d" config user.email "test@test"
    git -C "$d" config user.name  "Test"
    build_fixture "$d"
    git -C "$d" add -A && git -C "$d" commit -q -m "init"
  }

  # --- Scenario 1: rotate-clean-tree --------------------------------------
  local d1="$tmp/repo1"; mkdir -p "$d1"
  init_repo "$d1"
  ROADMAP_ROTATE_REPO="$d1" run_main --sprint-end 2026-06-01 2>/dev/null
  local rc=$?
  if [ "$rc" -ne 0 ]; then echo "FAIL: rotate-clean-tree exit=$rc"; fail=1
  elif [ ! -d "$d1/docs/archive/roadmaps/2026-06-01" ]; then echo "FAIL: rotate-clean-tree no archive dir"; fail=1
  elif ! grep -qE '^## NOW — Post-launch' "$d1/docs/ROADMAP_PRODUCT.md"; then echo "FAIL: rotate-clean-tree NOW not promoted from NEXT (product)"; fail=1
  elif ! grep -qE '^## NEXT — TBD' "$d1/docs/ROADMAP_PRODUCT.md"; then echo "FAIL: rotate-clean-tree no empty NEXT placeholder (product)"; fail=1
  elif grep -q 'Active item A' "$d1/docs/ROADMAP_PRODUCT.md"; then echo "FAIL: rotate-clean-tree old NOW item leaked"; fail=1
  elif ! grep -q 'Future item N' "$d1/docs/ROADMAP_PRODUCT.md"; then echo "FAIL: rotate-clean-tree promoted NEXT body lost"; fail=1
  elif ! grep -qE '^## LATER' "$d1/docs/ROADMAP_PRODUCT.md"; then echo "FAIL: rotate-clean-tree LATER section lost"; fail=1
  else echo "PASS: rotate-clean-tree"
  fi

  # --- Scenario 2: rotate-dirty-tree --------------------------------------
  local d2="$tmp/repo2"; mkdir -p "$d2"
  init_repo "$d2"
  echo "extra dirty change" >> "$d2/docs/ROADMAP_PRODUCT.md"
  ROADMAP_ROTATE_REPO="$d2" run_main 2>/tmp/dirty.err
  rc=$?
  if [ "$rc" -ne 2 ]; then echo "FAIL: rotate-dirty-tree expected exit 2, got $rc"; fail=1
  elif ! grep -q "dirty:" /tmp/dirty.err; then echo "FAIL: rotate-dirty-tree no 'dirty:' in stderr"; fail=1
  else echo "PASS: rotate-dirty-tree"
  fi
  rm -f /tmp/dirty.err

  # --- Scenario 3: rotate-no-next -----------------------------------------
  local d3="$tmp/repo3"; mkdir -p "$d3"
  init_repo "$d3"
  # Strip NEXT section entirely from one file.
  awk '
    /^## NEXT/ { in_next=1; next }
    in_next && /^## / { in_next=0; print; next }
    in_next { next }
    { print }
  ' "$d3/docs/ROADMAP_PRODUCT.md" > /tmp/no-next.md && mv /tmp/no-next.md "$d3/docs/ROADMAP_PRODUCT.md"
  git -C "$d3" add -A && git -C "$d3" commit -q -m "no next"
  ROADMAP_ROTATE_REPO="$d3" run_main --sprint-end 2026-06-02 2>/tmp/no-next.err
  rc=$?
  if [ "$rc" -ne 0 ]; then echo "FAIL: rotate-no-next exit=$rc"; fail=1
  elif ! grep -q "WARN no NEXT" /tmp/no-next.err; then echo "FAIL: rotate-no-next no WARN in stderr"; fail=1
  elif ! grep -qE '^## NOW — TBD' "$d3/docs/ROADMAP_PRODUCT.md"; then echo "FAIL: rotate-no-next NOW not TBD"; fail=1
  else echo "PASS: rotate-no-next"
  fi
  rm -f /tmp/no-next.err

  # --- Scenario 4: rotate-archive-collision -------------------------------
  local d4="$tmp/repo4"; mkdir -p "$d4"
  init_repo "$d4"
  mkdir -p "$d4/docs/archive/roadmaps/2026-06-03"
  ROADMAP_ROTATE_REPO="$d4" run_main --sprint-end 2026-06-03 2>/dev/null
  rc=$?
  if [ "$rc" -ne 0 ]; then echo "FAIL: rotate-archive-collision exit=$rc"; fail=1
  elif [ ! -d "$d4/docs/archive/roadmaps/2026-06-03-2" ]; then echo "FAIL: rotate-archive-collision no -2 suffix dir"; fail=1
  else echo "PASS: rotate-archive-collision"
  fi

  return $fail
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit $?
fi

run_main "$@"
