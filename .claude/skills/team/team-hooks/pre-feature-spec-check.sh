#!/bin/bash
# pre-feature-spec-check.sh — T1.4 ROADMAP_TEAM KR2.
#
# Enforces Spec Kit (spec.md + design.md + tasks.md) presence + non-emptiness for
# non-trivial feature/refactor runs at end of dispatcher Step 4 (post Spec Kit).
#
# Inputs (env vars from dispatcher):
#   RUN_ID               (required) — team-state run id
#   MODE                 (required) — feature|bug|refactor|chore|hotfix|audit|mockup
#   DESCRIPTION          (required) — user task description (one-liner)
#   OVERRIDE_SPEC_KIT    (optional) — "1" enables --no-spec-kit override (audit trail)
#
# Optional flag:
#   --self-test          — run the 7 design-doc scenarios, exit 0 if all pass.
#
# Exit: 0 PASS, 1 FAIL.
#
# Concurrency: state.json writes serialize via mkdir-based compare-and-swap
# (atomic on POSIX). Same pattern as post-edit-lint.sh. No `flock` dependency.

set -uo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"

# --- Force-non-trivial keywords (always require Spec Kit, regardless of mode) ---
FORCE_REGEX='(security|auth|migration|password|token|permission|rbac|oauth|jwt|crypto|encrypt)'

# --- Trivial keywords (skip Spec Kit when no force keyword and not feature/refactor) ---
TRIVIAL_REGEX='(typo|^comment$|dep[s]? bump|version bump|bump deps|lockfile|whitespace|rename file only)'

# --- Mode bypass (no Spec Kit ever required) ---
MODE_BYPASS_REGEX='^(chore|hotfix|audit|mockup)$'

# --- Spec Kit byte threshold ---
MIN_BYTES=200

# --- Compare-and-swap state.json mutation -----------------------------------
update_state() {
  local state_file="$1"; shift
  local jq_expr="$1"; shift
  local lock_dir="$state_file.lock.d"
  local attempt=0
  local max_attempts=30
  while [ "$attempt" -lt "$max_attempts" ]; do
    if mkdir "$lock_dir" 2>/dev/null; then
      echo $$ > "$lock_dir/owner"
      local cur_v
      cur_v=$(jq -r '.version' "$state_file" 2>/dev/null || echo "0")
      local new_v=$((cur_v + 1))
      local now
      now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      if jq "$@" --argjson __v "$new_v" --arg __ts "$now" \
          "(.version = \$__v | .updatedAt = \$__ts) | $jq_expr" \
          "$state_file" > "$state_file.tmp"; then
        mv "$state_file.tmp" "$state_file"
        rm -rf "$lock_dir"
        return 0
      fi
      rm -f "$state_file.tmp"
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
  echo "pre-feature-spec-check: state lock timeout after ${max_attempts}*100ms" >&2
  return 1
}

# --- Emit gate verdict + STORY.md audit (override path only) ----------------
emit_gate() {
  local state_dir="$1"
  local verdict="$2"
  local details="$3"
  local state_file="$state_dir/state.json"

  if [ ! -f "$state_file" ]; then
    return 0
  fi
  command -v jq &>/dev/null || return 0

  local gate_json
  gate_json=$(jq -n --arg verdict "$verdict" --arg details "$details" \
    '{name: "spec-kit", verdict: $verdict, ts: "PLACEHOLDER", details: $details}')

  update_state "$state_file" \
    '.gates = (.gates // []) + [($__gate | .ts = $__ts)]' \
    --argjson __gate "$gate_json"
}

append_override_audit() {
  local state_dir="$1"
  local description="$2"
  local story="$state_dir/STORY.md"
  [ -f "$story" ] || return 0
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  {
    printf '\n## override — dispatcher — %s\n\n' "$now"
    printf -- '- reason: --no-spec-kit (OVERRIDE_SPEC_KIT=1)\n'
    printf -- '- description: %s\n' "$description"
    printf -- '- audit: explicit user opt-out, reviewer must justify in review section\n'
  } >> "$story"
}

# --- Core check -------------------------------------------------------------
# Returns: prints "<verdict>|<details>" then sets RC.
#   verdict in {PASS, WARN, FAIL}
#   RC: 0 PASS/WARN, 1 FAIL.
check() {
  local mode="$1"
  local description="$2"
  local override="$3"
  local state_dir="$4"

  if [ "$override" = "1" ]; then
    printf 'WARN|override: --no-spec-kit (mode=%s)\n' "$mode"
    return 0
  fi

  local desc_lower
  desc_lower=$(printf '%s' "$description" | tr '[:upper:]' '[:lower:]')
  local mode_lower
  mode_lower=$(printf '%s' "$mode" | tr '[:upper:]' '[:lower:]')

  local force_match=""
  if printf '%s' "$desc_lower" | grep -qE "$FORCE_REGEX"; then
    force_match=$(printf '%s' "$desc_lower" | grep -oE "$FORCE_REGEX" | head -1)
  fi

  local mode_bypass=0
  if [ -z "$force_match" ] && printf '%s' "$mode_lower" | grep -qE "$MODE_BYPASS_REGEX"; then
    mode_bypass=1
  fi

  if [ "$mode_bypass" = "1" ]; then
    printf 'PASS|mode bypass: %s\n' "$mode_lower"
    return 0
  fi

  if [ -z "$force_match" ] && [ "$mode_lower" != "feature" ] && [ "$mode_lower" != "refactor" ]; then
    if printf '%s' "$desc_lower" | grep -qE "$TRIVIAL_REGEX"; then
      printf 'PASS|trivial bypass: mode=%s + trivial keywords\n' "$mode_lower"
      return 0
    fi
  fi

  # Non-trivial path — Spec Kit required.
  local missing=""
  local empty=""
  local placeholder=""
  local total_bytes=0
  for f in spec.md design.md tasks.md; do
    local p="$state_dir/$f"
    if [ ! -f "$p" ]; then
      missing+="$f "
      continue
    fi
    local sz
    sz=$(wc -c < "$p" 2>/dev/null | tr -d ' ')
    sz=${sz:-0}
    if [ "$sz" -lt "$MIN_BYTES" ]; then
      empty+="$f(${sz}B) "
      continue
    fi
    # Placeholder check: file with only `{{...}}` tokens or no `## ` headers is unfilled.
    if ! grep -qE '^## [^{]' "$p" 2>/dev/null; then
      placeholder+="$f "
      continue
    fi
    total_bytes=$((total_bytes + sz))
  done

  local reason_suffix=""
  if [ -n "$force_match" ]; then
    reason_suffix=" (force keyword: $force_match)"
  fi

  if [ -n "$missing" ] || [ -n "$empty" ] || [ -n "$placeholder" ]; then
    local detail="missing:[${missing% }] empty:[${empty% }] placeholder:[${placeholder% }]${reason_suffix}"
    printf 'FAIL|%s\n' "$detail"
    return 1
  fi

  printf 'PASS|full spec kit (%d files, %d bytes total)%s\n' 3 "$total_bytes" "$reason_suffix"
  return 0
}

# --- Self-test --------------------------------------------------------------
_SELFTEST_TMP_ROOT=""
_selftest_cleanup() {
  if [ -n "${_SELFTEST_TMP_ROOT:-}" ] && [ -d "$_SELFTEST_TMP_ROOT" ]; then
    rm -rf "$_SELFTEST_TMP_ROOT"
  fi
}

self_test() {
  _SELFTEST_TMP_ROOT=$(mktemp -d -t pre-feature-spec-check-selftest-XXXXXX)
  local tmp_root="$_SELFTEST_TMP_ROOT"
  trap _selftest_cleanup EXIT

  local pass_count=0
  local fail_count=0
  local total=8

  run_scenario() {
    local label="$1"
    local mode="$2"
    local description="$3"
    local override="$4"
    local setup_files="$5"      # space-separated: "spec.md:full design.md:full tasks.md:empty"
    local expect_verdict="$6"
    local expect_rc="$7"

    local sd="$tmp_root/$label"
    mkdir -p "$sd"
    if [ -n "$setup_files" ]; then
      for entry in $setup_files; do
        local fname="${entry%%:*}"
        local kind="${entry##*:}"
        case "$kind" in
          full)
            {
              printf '# %s — selftest\n\n' "$fname"
              printf '## Section A — selftest content\n\n'
              # pad to >200 bytes:
              for _ in $(seq 1 25); do printf 'lorem ipsum dolor sit amet\n'; done
            } > "$sd/$fname"
            ;;
          empty)
            : > "$sd/$fname"
            ;;
          placeholder)
            printf '# {{TASK_TITLE}}\n\n## {{HEADER}}\n\n{{CONTENT}}\n' > "$sd/$fname"
            # pad to >200B with placeholder lines so byte-check passes but header check fails:
            for _ in $(seq 1 10); do printf '{{LINE}}\n' ; done >> "$sd/$fname"
            ;;
        esac
      done
    fi

    # capture verdict via check()
    local out rc
    out=$(check "$mode" "$description" "$override" "$sd")
    rc=$?
    local verdict="${out%%|*}"

    if [ "$verdict" = "$expect_verdict" ] && [ "$rc" = "$expect_rc" ]; then
      pass_count=$((pass_count + 1))
      printf '  [PASS] %-32s verdict=%s rc=%s\n' "$label" "$verdict" "$rc"
    else
      fail_count=$((fail_count + 1))
      printf '  [FAIL] %-32s expected verdict=%s rc=%s, got verdict=%s rc=%s (out=%s)\n' \
        "$label" "$expect_verdict" "$expect_rc" "$verdict" "$rc" "$out"
    fi
  }

  printf 'pre-feature-spec-check self-test:\n'
  run_scenario "mode-bypass-chore"       "chore"    "bump deps to latest"          ""  ""                                                "PASS" "0"
  run_scenario "mode-bypass-hotfix"      "hotfix"   "fix prod 500 on /chat"        ""  ""                                                "PASS" "0"
  run_scenario "trivial-narrow-bug"      "bug"      "fix typo in readme"           ""  ""                                                "PASS" "0"
  run_scenario "override"                "feature"  "add user profile"             "1" ""                                                "WARN" "0"
  run_scenario "non-trivial-reject-miss" "feature"  "add admin RBAC"               ""  ""                                                "FAIL" "1"
  run_scenario "non-trivial-reject-empty" "feature" "add user profile"             ""  "spec.md:empty design.md:full tasks.md:full"      "FAIL" "1"
  run_scenario "non-trivial-pass"        "feature"  "add user profile"             ""  "spec.md:full design.md:full tasks.md:full"       "PASS" "0"
  run_scenario "force-keyword-bug"       "bug"      "fix auth login redirect"      ""  ""                                                "FAIL" "1"

  printf '%d/%d scenarios PASS\n' "$pass_count" "$total"
  if [ "$fail_count" -ne 0 ]; then
    return 1
  fi
  return 0
}

# --- Entrypoint -------------------------------------------------------------
if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit $?
fi

RUN_ID="${RUN_ID:-}"
MODE="${MODE:-}"
DESCRIPTION="${DESCRIPTION:-}"
OVERRIDE_SPEC_KIT="${OVERRIDE_SPEC_KIT:-}"

if [ -z "$RUN_ID" ]; then
  echo "pre-feature-spec-check: RUN_ID unset — skip"
  exit 0
fi

STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
if [ ! -d "$STATE_DIR" ]; then
  echo "pre-feature-spec-check: STATE_DIR missing ($STATE_DIR) — skip"
  exit 0
fi

if [ -z "$MODE" ] || [ -z "$DESCRIPTION" ]; then
  echo "pre-feature-spec-check: MODE or DESCRIPTION missing — skip"
  exit 0
fi

command -v jq &>/dev/null || { echo "pre-feature-spec-check: jq missing — skip"; exit 0; }

OUT=$(check "$MODE" "$DESCRIPTION" "$OVERRIDE_SPEC_KIT" "$STATE_DIR")
RC=$?
VERDICT="${OUT%%|*}"
DETAILS="${OUT#*|}"

emit_gate "$STATE_DIR" "$VERDICT" "$DETAILS" || {
  echo "pre-feature-spec-check: state update failed" >&2
  exit 1
}

if [ "$VERDICT" = "WARN" ] && [ "$OVERRIDE_SPEC_KIT" = "1" ]; then
  append_override_audit "$STATE_DIR" "$DESCRIPTION"
fi

echo "pre-feature-spec-check: $VERDICT ($DETAILS)"
exit "$RC"
