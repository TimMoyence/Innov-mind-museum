#!/bin/bash
# post-complete-lesson-capture.sh — T2.1 ROADMAP_TEAM KR4.
#
# Auto-captures a reflective lesson from a completed /team run.
# Wired into dispatcher Step 9 (Finalize). Fail-open: hook failure NEVER
# blocks finalize (R10). Lesson dumped to team-knowledge/lessons/<RUN_ID>.md.
#
# Inputs (env vars from dispatcher):
#   RUN_ID      (required) — team-state run id
#   STATE_FILE  (optional) — path to state.json
#                            default: .claude/skills/team/team-state/$RUN_ID/state.json
#
# Optional flag:
#   --self-test   — run the 6 design-doc scenarios, exit 0 if all pass.
#
# Exit: 0 always (graceful degrade). Non-fatal warnings to stderr.
#
# Concurrency: state.json writes use mkdir-CAS (matches pre-feature-spec-check.sh).

set -uo pipefail

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
LESSONS_DIR="$REPO_ROOT/.claude/skills/team/team-knowledge/lessons"

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
  echo "post-complete-lesson-capture: state lock timeout" >&2
  return 1
}

# --- Append gate verdict (PASS or WARN) to state.json -----------------------
emit_gate() {
  local state_file="$1"
  local verdict="$2"
  local details="$3"
  [ -f "$state_file" ] || return 0
  command -v jq &>/dev/null || return 0

  local gate_json
  gate_json=$(jq -n --arg verdict "$verdict" --arg details "$details" \
    '{name: "lesson-capture", verdict: $verdict, ts: "PLACEHOLDER", details: $details}')

  # shellcheck disable=SC2016
  # Justification: jq filter — $__gate / $__ts are jq variables, not shell.
  update_state "$state_file" \
    '.gates = (.gates // []) + [($__gate | .ts = $__ts)]' \
    --argjson __gate "$gate_json" || true
}

# --- Extract section body from STORY.md by header name ----------------------
# Args: <story_file> <section_header>  (e.g. extract_section file.md "## brainstorm")
# Stdout: section body up to the next ^## or EOF, trimmed. Empty if header missing.
extract_section() {
  local story="$1"
  local header="$2"
  [ -f "$story" ] || { printf ''; return 0; }
  awk -v hdr="$header" '
    BEGIN { in_section = 0; first_after = 1 }
    {
      if (in_section) {
        if ($0 ~ /^## /) { in_section = 0; next }
        if (first_after && $0 ~ /^[[:space:]]*$/) { next }
        first_after = 0
        print
      }
      if ($0 ~ "^" hdr "( |$)") { in_section = 1; first_after = 1 }
    }
  ' "$story" | sed -e :a -e '/^$/{$d;N;ba' -e '}'
}

# --- Auto-tag lesson from STORY brainstorm + mode + pipeline ----------------
# Stdout: comma-separated tag list (mode, pipeline, then up to 3 lowercase
# alphanum-keyword tokens from the brainstorm first paragraph)
auto_tag() {
  local story="$1"
  local mode="$2"
  local pipeline="$3"
  local brainstorm
  brainstorm=$(extract_section "$story" "## brainstorm")
  local kw_block
  kw_block=$(printf '%s' "$brainstorm" | head -10 | tr -c '[:alnum:]-' ' ' \
    | tr '[:upper:]' '[:lower:]')
  # Words at least 4 chars, exclude common stop words
  local kws
  # shellcheck disable=SC2086
  # Justification: intentional word splitting on $kw_block to feed one token per line to awk.
  kws=$(printf '%s\n' $kw_block | awk 'length($0) >= 4' \
    | grep -vE '^(input|output|opus|architect|editor|verifier|reviewer|description|decisions|user|with|from|that|this|been|have|will|task|run-id|inline|dispatcher|first|then|none|null|file|files)$' \
    | awk '!seen[$0]++' \
    | head -3 | paste -sd, -)
  if [ -z "$kws" ]; then
    printf '%s,%s\n' "$mode" "$pipeline"
  else
    printf '%s,%s,%s\n' "$mode" "$pipeline" "$kws"
  fi
}

# --- Write the lesson markdown file -----------------------------------------
# Returns: prints written path on stdout; non-zero exit on write failure.
write_lesson() {
  local state_file="$1"
  local out_dir="$2"

  local run_id mode pipeline created_at completed_at story
  run_id=$(jq -r '.runId // ""'                         "$state_file")
  mode=$(jq -r '.mode // "feature"'                     "$state_file")
  pipeline=$(jq -r '.pipeline // "standard"'            "$state_file")
  created_at=$(jq -r '.createdAt // ""'                 "$state_file")
  completed_at=$(jq -r '.updatedAt // ""'               "$state_file")
  story=$(jq -r '.story // ""'                          "$state_file")
  local corrective_loops cost_usd
  corrective_loops=$(jq -r '.telemetry.correctiveLoops // 0' "$state_file")
  cost_usd=$(jq -r '.telemetry.costUSD // .telemetry.estimatedCostUSD // 0' "$state_file")

  if [ -z "$run_id" ]; then
    echo "post-complete-lesson-capture: runId missing in state.json" >&2
    return 1
  fi

  # Duration in ms
  local duration_ms="0"
  if command -v python3 &>/dev/null && [ -n "$created_at" ] && [ -n "$completed_at" ]; then
    duration_ms=$(python3 -c "
from datetime import datetime
try:
    a = datetime.fromisoformat('${created_at}'.replace('Z','+00:00'))
    b = datetime.fromisoformat('${completed_at}'.replace('Z','+00:00'))
    print(int((b - a).total_seconds() * 1000))
except Exception:
    print(0)
" 2>/dev/null || echo "0")
  fi

  # Resolve absolute story path
  local story_abs=""
  if [ -n "$story" ]; then
    if [ "${story:0:1}" = "/" ]; then
      story_abs="$story"
    else
      story_abs="$REPO_ROOT/$story"
    fi
  fi

  # Section bodies (may be empty)
  local trigger_body worked_body failed_body surprises_body actions_body
  trigger_body=$(extract_section "$story_abs" "## brainstorm")
  worked_body=$(extract_section "$story_abs" "## verify")
  failed_body=$(extract_section "$story_abs" "## review")
  surprises_body=$(extract_section "$story_abs" "## implement")
  actions_body=$(extract_section "$story_abs" "## finalize")

  # Honesty rule (UFR-013): explicit "_no data captured_" when section empty
  empty_sentinel="_no data captured_"
  [ -z "$trigger_body"   ] && trigger_body="$empty_sentinel"
  [ -z "$worked_body"    ] && worked_body="$empty_sentinel"
  [ -z "$failed_body"    ] && failed_body="$empty_sentinel"
  [ -z "$surprises_body" ] && surprises_body="$empty_sentinel"
  [ -z "$actions_body"   ] && actions_body="$empty_sentinel"

  # Tags
  local tags
  tags=$(auto_tag "$story_abs" "$mode" "$pipeline")
  local tags_yaml=""
  IFS=',' read -ra TAG_ARR <<< "$tags"
  for t in "${TAG_ARR[@]}"; do
    [ -n "$t" ] && tags_yaml+="  - $t"$'\n'
  done

  mkdir -p "$out_dir"

  # Resolve target path; on RUN_ID collision append HHMMSS suffix (R4)
  local target="$out_dir/$run_id.md"
  if [ -e "$target" ]; then
    target="$out_dir/$run_id-$(date +%H%M%S).md"
  fi

  # Write lesson (use printf for portability vs heredoc edge cases)
  {
    printf -- '---\n'
    printf -- 'runId: %s\n'           "$run_id"
    printf -- 'mode: %s\n'            "$mode"
    printf -- 'pipeline: %s\n'        "$pipeline"
    printf -- 'completedAt: %s\n'     "$completed_at"
    printf -- 'durationMs: %s\n'      "$duration_ms"
    printf -- 'correctiveLoops: %s\n' "$corrective_loops"
    printf -- 'costUSD: %s\n'         "$cost_usd"
    printf -- 'tags:\n%s'             "$tags_yaml"
    printf -- '---\n\n'
    printf -- '# Lesson — %s\n\n' "$run_id"
    printf -- '## Trigger\n\n%s\n\n' "$trigger_body"
    printf -- '## What worked\n\n%s\n\n' "$worked_body"
    printf -- '## What failed\n\n%s\n\n' "$failed_body"
    printf -- '## Surprises\n\n%s\n\n' "$surprises_body"
    printf -- '## Action items\n\n%s\n' "$actions_body"
  } > "$target"

  printf '%s\n' "$target"
  return 0
}

# --- Self-test --------------------------------------------------------------
_SELFTEST_TMP=""
# shellcheck disable=SC2329
# Justification: invoked indirectly via `trap _selftest_cleanup EXIT` in self_test().
_selftest_cleanup() { [ -n "$_SELFTEST_TMP" ] && rm -rf "$_SELFTEST_TMP"; }

self_test() {
  trap _selftest_cleanup EXIT
  _SELFTEST_TMP=$(mktemp -d)
  local pass=0
  local fail=0

  # Helper: build a synthetic state + STORY in $1 with status $2
  build_run() {
    local d="$1" status="$2"
    mkdir -p "$d"
    cat > "$d/state.json" <<EOF
{
  "runId": "selftest-2026-05-03-foo",
  "version": 5,
  "createdAt": "2026-05-03T07:00:00Z",
  "updatedAt": "2026-05-03T07:30:00Z",
  "mode": "feature",
  "pipeline": "standard",
  "currentStep": "step-9-finalize",
  "status": "$status",
  "startCommit": "abc123def456",
  "story": "$d/STORY.md",
  "agents": [],
  "handoffs": [],
  "gates": [],
  "telemetry": { "correctiveLoops": 0, "costUSD": 1.94 }
}
EOF
    cat > "$d/STORY.md" <<'EOF'
# STORY

## brainstorm — architect — 2026-05-03T07:00:00Z

This run touched hooks and knowledge base infra to capture lessons.

## verify — verifier — 2026-05-03T07:25:00Z

- gates: lint PASS, tsc PASS
- verdict: PASS
EOF
  }

  # Scenario 1 — status=completed → file written
  local d1="$_SELFTEST_TMP/s1"
  build_run "$d1" "completed"
  local out_dir1="$_SELFTEST_TMP/lessons1"
  local written1
  written1=$(write_lesson "$d1/state.json" "$out_dir1")
  if [ -f "$written1" ] && [ "$(wc -c < "$written1")" -ge 200 ]; then
    pass=$((pass + 1))
  else
    echo "  SCENARIO 1 FAIL: file=$written1" >&2
    fail=$((fail + 1))
  fi

  # Scenario 2 — status=running → no file (handled by entrypoint, not write_lesson)
  # We test the entrypoint guard via a subshell call.
  local d2="$_SELFTEST_TMP/s2"
  build_run "$d2" "running"
  local out_dir2="$_SELFTEST_TMP/lessons2"
  mkdir -p "$out_dir2"
  RUN_ID="s2" STATE_FILE="$d2/state.json" LESSONS_DIR="$out_dir2" "$0" >/dev/null 2>&1 || true
  if [ "$(find "$out_dir2" -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')" = "0" ]; then
    pass=$((pass + 1))
  else
    echo "  SCENARIO 2 FAIL: file written despite status=running" >&2
    fail=$((fail + 1))
  fi

  # Scenario 3 — status=failed → no file
  local d3="$_SELFTEST_TMP/s3"
  build_run "$d3" "failed"
  local out_dir3="$_SELFTEST_TMP/lessons3"
  mkdir -p "$out_dir3"
  RUN_ID="s3" STATE_FILE="$d3/state.json" LESSONS_DIR="$out_dir3" "$0" >/dev/null 2>&1 || true
  if [ "$(find "$out_dir3" -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')" = "0" ]; then
    pass=$((pass + 1))
  else
    echo "  SCENARIO 3 FAIL: file written despite status=failed" >&2
    fail=$((fail + 1))
  fi

  # Scenario 4 — RUN_ID collision → timestamp-suffixed file
  local d4="$_SELFTEST_TMP/s4"
  build_run "$d4" "completed"
  local out_dir4="$_SELFTEST_TMP/lessons4"
  write_lesson "$d4/state.json" "$out_dir4" >/dev/null
  sleep 1   # ensure HHMMSS differs
  write_lesson "$d4/state.json" "$out_dir4" >/dev/null
  local count4
  count4=$(find "$out_dir4" -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count4" = "2" ]; then
    pass=$((pass + 1))
  else
    echo "  SCENARIO 4 FAIL: expected 2 files got $count4" >&2
    fail=$((fail + 1))
  fi

  # Scenario 5 — STORY.md missing → no fabrication, sections say "_no data captured_"
  local d5="$_SELFTEST_TMP/s5"
  build_run "$d5" "completed"
  rm -f "$d5/STORY.md"
  local out_dir5="$_SELFTEST_TMP/lessons5"
  local written5
  written5=$(write_lesson "$d5/state.json" "$out_dir5")
  if grep -q "_no data captured_" "$written5"; then
    pass=$((pass + 1))
  else
    echo "  SCENARIO 5 FAIL: missing _no data captured_ marker" >&2
    fail=$((fail + 1))
  fi

  # Scenario 6 — corrupt state.json → graceful exit, no crash, no file
  local d6="$_SELFTEST_TMP/s6"
  mkdir -p "$d6"
  echo "{ this is not valid json" > "$d6/state.json"
  local out_dir6="$_SELFTEST_TMP/lessons6"
  mkdir -p "$out_dir6"
  RUN_ID="s6" STATE_FILE="$d6/state.json" LESSONS_DIR="$out_dir6" "$0" >/dev/null 2>&1
  local rc6=$?
  if [ "$rc6" = "0" ] && [ "$(find "$out_dir6" -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')" = "0" ]; then
    pass=$((pass + 1))
  else
    echo "  SCENARIO 6 FAIL: rc=$rc6 or unexpected file written" >&2
    fail=$((fail + 1))
  fi

  echo "post-complete-lesson-capture self-test: PASS $pass / $((pass + fail))"
  if [ "$fail" -gt 0 ]; then
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
if [ -z "$RUN_ID" ]; then
  echo "post-complete-lesson-capture: RUN_ID unset — skip" >&2
  exit 0
fi

STATE_FILE="${STATE_FILE:-$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID/state.json}"
if [ ! -f "$STATE_FILE" ]; then
  echo "post-complete-lesson-capture: state.json missing ($STATE_FILE) — skip" >&2
  exit 0
fi

command -v jq &>/dev/null || { echo "post-complete-lesson-capture: jq missing — skip" >&2; exit 0; }

STATUS=$(jq -r '.status // ""' "$STATE_FILE" 2>/dev/null || echo "")
if [ "$STATUS" != "completed" ]; then
  # R3 + R10: graceful skip, no warn
  exit 0
fi

if WRITTEN=$(write_lesson "$STATE_FILE" "$LESSONS_DIR" 2>&1); then
  echo "lesson-capture: WROTE $WRITTEN"
  emit_gate "$STATE_FILE" "PASS" "lesson written: $WRITTEN"
  # Optional Langfuse span (fail-open)
  if [ -x "$REPO_ROOT/.claude/skills/team/lib/trace.sh" ]; then
    "$REPO_ROOT/.claude/skills/team/lib/trace.sh" emit \
      "team.lesson.captured" "$RUN_ID" "{\"path\":\"$WRITTEN\"}" 2>/dev/null || true
  fi
  exit 0
else
  echo "lesson-capture: SKIP write_lesson failed — $WRITTEN" >&2
  emit_gate "$STATE_FILE" "WARN" "write_lesson failed (graceful degrade)"
  exit 0
fi
