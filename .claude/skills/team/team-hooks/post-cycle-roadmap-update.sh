#!/bin/bash
# post-cycle-roadmap-update.sh — T1.6 ROADMAP_TEAM (auto-consolidation roadmap × /team).
#
# At Step 9 finalize, fuzzy-match run DESCRIPTION against unticked items in
# `roadmap-context.json`, propose `[x]` tick via patch staged (NEVER auto-commit).
#
# Inputs (env):
#   RUN_ID                       (required) — team-state run id
#   DESCRIPTION                  (required) — verbatim run description
#   MODE                         (optional) — feature|bug|refactor|chore|hotfix|audit|mockup
#                                              chore/hotfix/audit/mockup → SKIP (no tick)
#   ROADMAP_MATCH_THRESHOLD      (optional) — Jaccard threshold, default 0.6
#
# Optional flag:
#   --self-test                  — 4 inline scenarios, exit 0 if all PASS.
#
# Exit: 0 always when not --self-test (degrade to verdict=NO_MATCH on no signal).
#       1 only if dependency missing (roadmap-context.json absent).
#       --self-test exits 1 on any FAIL.
#
# Output:
#   team-state/$RUN_ID/roadmap-tick-proposal.json
#     {
#       "proposedAt": "ISO ts",
#       "description": "...",
#       "verdict": "MATCH"|"AMBIGUOUS"|"NO_MATCH"|"SKIP",
#       "matched":    { "file":..., "line":N, "id":..., "text":..., "score":F } | null,
#       "candidates": [ same shape, sorted desc, top 5 ],
#       "patchPath":  "...path/to/roadmap-tick.patch" | null
#     }
#   team-state/$RUN_ID/roadmap-tick.patch (only if verdict=MATCH)

set -uo pipefail
# Force C locale so awk printf "%.4f" uses '.' (not ',' on FR), needed for jq.
export LC_ALL=C LANG=C

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
DEFAULT_THRESHOLD="0.6"

# ---------------------------------------------------------------------------
# Tokenize: lowercase, split on non-alphanumeric, filter len >= 3.
# Stdin: text. Stdout: one token per line, sorted unique.
# ---------------------------------------------------------------------------
tokenize() {
  tr '[:upper:]' '[:lower:]' \
    | tr -c 'a-z0-9' '\n' \
    | awk 'length($0) >= 3' \
    | sort -u
}

# ---------------------------------------------------------------------------
# Jaccard score = |A ∩ B| / |A ∪ B|. Inputs: 2 sorted-uniq token files.
# Output: float 0..1 with 4 decimals.
# ---------------------------------------------------------------------------
jaccard() {
  local file_a="$1"
  local file_b="$2"
  local inter union
  inter=$(comm -12 "$file_a" "$file_b" | wc -l | tr -d ' ')
  union=$(cat "$file_a" "$file_b" | sort -u | wc -l | tr -d ' ')
  if [ "$union" -eq 0 ]; then echo "0.0000"; return; fi
  awk -v i="$inter" -v u="$union" 'BEGIN { printf "%.4f", i/u }'
}

run_main() {
  : "${RUN_ID:?RUN_ID is required}"
  : "${DESCRIPTION:?DESCRIPTION is required}"
  local mode="${MODE:-feature}"
  local threshold="${ROADMAP_MATCH_THRESHOLD:-$DEFAULT_THRESHOLD}"
  local out_dir="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
  local ctx_file="$out_dir/roadmap-context.json"
  local out_file="$out_dir/roadmap-tick-proposal.json"
  local patch_file="$out_dir/roadmap-tick.patch"
  rm -f "$patch_file"

  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # SKIP modes -------------------------------------------------------------
  case "$mode" in
    chore|hotfix|audit|mockup)
      jq -n --arg ts "$ts" --arg desc "$DESCRIPTION" --arg mode "$mode" \
        '{proposedAt:$ts, description:$desc, verdict:"SKIP", reason:("mode="+$mode), matched:null, candidates:[], patchPath:null}' \
        > "$out_file"
      echo "post-cycle-roadmap-update: verdict=SKIP mode=$mode" >&2
      return 0
      ;;
  esac

  if [ ! -f "$ctx_file" ]; then
    echo "post-cycle-roadmap-update: roadmap-context.json missing — pre-cycle hook not run? path=$ctx_file" >&2
    return 1
  fi

  # Tokenize description into a temp file ----------------------------------
  local tmp
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  echo "$DESCRIPTION" | tokenize > "$tmp/desc.tok"

  # Score every item from both arrays --------------------------------------
  # Build a TSV: score \t file \t line \t id \t text
  local scores_tsv="$tmp/scores.tsv"
  : > "$scores_tsv"
  local n
  n=$(jq '(.productItems + .teamItems) | length' "$ctx_file")
  if [ "$n" -eq 0 ]; then
    jq -n --arg ts "$ts" --arg desc "$DESCRIPTION" \
      '{proposedAt:$ts, description:$desc, verdict:"NO_MATCH", reason:"empty roadmap", matched:null, candidates:[], patchPath:null}' \
      > "$out_file"
    echo "post-cycle-roadmap-update: verdict=NO_MATCH (empty roadmap)" >&2
    return 0
  fi

  local i=0
  while [ "$i" -lt "$n" ]; do
    local item file line id parent text
    item=$(jq -c "(.productItems + .teamItems)[$i]" "$ctx_file")
    file=$(echo "$item" | jq -r '.file')
    line=$(echo "$item" | jq -r '.line')
    id=$(echo "$item" | jq -r '.id // ""')
    parent=$(echo "$item" | jq -r '.parentSection // ""')
    text=$(echo "$item" | jq -r '.text')
    # Tokenize id + parent header + item text — parent context disambiguates
    # nested sub-tasks (e.g. T1.6 Auto-consolidation parents 3 hook bullets).
    echo "$id $parent $text" | tokenize > "$tmp/item.tok"
    local score
    score=$(jaccard "$tmp/desc.tok" "$tmp/item.tok")
    printf '%s\t%s\t%s\t%s\t%s\n' "$score" "$file" "$line" "$id" "$text" >> "$scores_tsv"
    i=$((i + 1))
  done

  # Sort by score desc + take top 5 candidates ------------------------------
  sort -t$'\t' -k1,1nr "$scores_tsv" -o "$scores_tsv"
  local candidates_json
  candidates_json=$(awk -F'\t' -v thr="0.05" 'BEGIN{first=1; printf "["} $1+0 >= thr+0 && NR <= 5 {
      gsub(/\\/, "\\\\", $5); gsub(/"/, "\\\"", $5); gsub(/\t/, "\\t", $5);
      gsub(/\\/, "\\\\", $4); gsub(/"/, "\\\"", $4);
      gsub(/\\/, "\\\\", $2); gsub(/"/, "\\\"", $2);
      if (first==1) first=0; else printf ",";
      id_val = ($4 == "" || $4 == "null") ? "null" : "\""$4"\"";
      printf "{\"file\":\"%s\",\"line\":%d,\"id\":%s,\"text\":\"%s\",\"score\":%s}", $2, $3, id_val, $5, $1+0
    } END{printf "]"}' "$scores_tsv")

  # Determine verdict -------------------------------------------------------
  local top_score top_line top_file top_text top_id second_score
  top_score=$(awk -F'\t' 'NR==1{print $1+0; exit}' "$scores_tsv")
  top_file=$(awk -F'\t' 'NR==1{print $2; exit}'  "$scores_tsv")
  top_line=$(awk -F'\t' 'NR==1{print $3; exit}'  "$scores_tsv")
  top_id=$(awk -F'\t'   'NR==1{print $4; exit}'  "$scores_tsv")
  top_text=$(awk -F'\t' 'NR==1{print $5; exit}'  "$scores_tsv")
  second_score=$(awk -F'\t' 'NR==2{print $1+0; exit}' "$scores_tsv")
  : "${second_score:=0}"

  local verdict matched_json="null" patch_emit="null"
  local cmp_top cmp_diff
  cmp_top=$(awk -v a="$top_score" -v b="$threshold" 'BEGIN{ print (a+0 >= b+0) ? "yes" : "no" }')
  cmp_diff=$(awk -v a="$top_score" -v b="$second_score" 'BEGIN{ print ((a+0 - b+0) > 0.1) ? "yes" : "no" }')

  if [ "$cmp_top" = "yes" ] && [ "$cmp_diff" = "yes" ]; then
    verdict="MATCH"
    # Build matched JSON
    local id_val="null"
    if [ -n "$top_id" ] && [ "$top_id" != "null" ]; then id_val="\"$top_id\""; fi
    local esc_text="${top_text//\\/\\\\}"; esc_text="${esc_text//\"/\\\"}"
    matched_json="{\"file\":\"$top_file\",\"line\":$top_line,\"id\":$id_val,\"text\":\"$esc_text\",\"score\":$top_score}"
    # Generate diff: replace `- [ ] ` with `- [x] ` on that exact line.
    local abs_path="$REPO_ROOT/$top_file"
    if [ -f "$abs_path" ]; then
      local original_line patched_line
      original_line=$(awk "NR==$top_line" "$abs_path")
      patched_line=$(echo "$original_line" | sed 's/- \[ \] /- [x] /')
      {
        echo "--- a/$top_file"
        echo "+++ b/$top_file"
        echo "@@ -$top_line,1 +$top_line,1 @@"
        echo "-$original_line"
        echo "+$patched_line"
      } > "$patch_file"
      patch_emit="\"$patch_file\""
    fi
  elif [ "$cmp_top" = "yes" ]; then
    verdict="AMBIGUOUS"
  else
    verdict="NO_MATCH"
  fi

  # Emit final JSON ---------------------------------------------------------
  jq -n \
    --arg ts "$ts" \
    --arg desc "$DESCRIPTION" \
    --arg verdict "$verdict" \
    --argjson matched "$matched_json" \
    --argjson candidates "$candidates_json" \
    --argjson patch "$patch_emit" \
    '{proposedAt:$ts, description:$desc, verdict:$verdict, matched:$matched, candidates:$candidates, patchPath:$patch}' \
    > "$out_file"

  echo "post-cycle-roadmap-update: verdict=$verdict top_score=$top_score threshold=$threshold candidates=$(echo "$candidates_json" | jq 'length')" >&2
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

  # Common fixture: produce roadmap-context.json directly.
  prepare_ctx() {
    local rid="$1"; shift
    local ctx_dir="$REPO_ROOT/.claude/skills/team/team-state/$rid"
    mkdir -p "$ctx_dir"
    cat > "$ctx_dir/roadmap-context.json" <<'EOF'
{
  "loadedAt": "2026-05-03T00:00:00Z",
  "verdict": "PASS",
  "productItems": [
    {"file":"docs/test-product.md","line":10,"id":"W1.1","text":"Cost estimation per agent"},
    {"file":"docs/test-product.md","line":11,"id":"W2.5","text":"Random unrelated thing about photography UX"}
  ],
  "teamItems": [
    {"file":"docs/test-team.md","line":50,"id":"T1.6","text":"Auto-consolidation roadmap orchestrator hooks"},
    {"file":"docs/test-team.md","line":51,"id":"T1.7","text":"Auto-consolidation roadmap orchestrator hooks"}
  ]
}
EOF
    # Also create the docs files referenced (so MATCH branch can read line N).
    mkdir -p "$REPO_ROOT/docs"
    if [ ! -f "$REPO_ROOT/docs/test-product.md" ]; then
      printf 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\n- [ ] item10\n- [ ] item11\n' > "$REPO_ROOT/docs/test-product.md"
    fi
    if [ ! -f "$REPO_ROOT/docs/test-team.md" ]; then
      local i=1
      : > "$REPO_ROOT/docs/test-team.md"
      while [ "$i" -le 49 ]; do echo "line$i" >> "$REPO_ROOT/docs/test-team.md"; i=$((i+1)); done
      echo '- [ ] **T1.6** Auto-consolidation roadmap intégration ROADMAP team' >> "$REPO_ROOT/docs/test-team.md"
      echo '- [ ] **T1.7** Auto-consolidation roadmap intégration ROADMAP team weekly' >> "$REPO_ROOT/docs/test-team.md"
    fi
  }

  cleanup_ctx() {
    rm -rf "$REPO_ROOT/.claude/skills/team/team-state/$1"
    rm -f "$REPO_ROOT/docs/test-product.md" "$REPO_ROOT/docs/test-team.md"
  }

  # Scenario 1: match-T1-6 — but with T1.7 sibling so we need higher score gap.
  # Use a very specific description that hits T1.6 only.
  local rid="self-test-match-t16"
  prepare_ctx "$rid"
  RUN_ID="$rid" \
  DESCRIPTION="Cost estimation per agent budget tokens" \
  MODE=feature \
    run_main 2>/dev/null
  local out="$REPO_ROOT/.claude/skills/team/team-state/$rid/roadmap-tick-proposal.json"
  if [ ! -f "$out" ]; then echo "FAIL: match-T1-6 no output"; fail=1
  elif [ "$(jq -r '.verdict' "$out")" != "MATCH" ]; then echo "FAIL: match-T1-6 verdict=$(jq -r .verdict "$out") (expected MATCH)"; fail=1
  elif [ "$(jq -r '.matched.id' "$out")" != "W1.1" ]; then echo "FAIL: match-T1-6 expected matched id W1.1, got $(jq -r .matched.id "$out")"; fail=1
  elif [ "$(jq -r '.patchPath' "$out")" = "null" ]; then echo "FAIL: match-T1-6 missing patch"; fail=1
  else echo "PASS: match-T1-6"
  fi
  cleanup_ctx "$rid"

  # Scenario 2: ambiguous-match — T1.6 vs T1.7 differ only by "weekly", desc is generic.
  rid="self-test-ambiguous"
  prepare_ctx "$rid"
  RUN_ID="$rid" \
  DESCRIPTION="Auto-consolidation roadmap orchestrator hooks" \
  MODE=feature \
    run_main 2>/dev/null
  out="$REPO_ROOT/.claude/skills/team/team-state/$rid/roadmap-tick-proposal.json"
  if [ ! -f "$out" ]; then echo "FAIL: ambiguous no output"; fail=1
  elif [ "$(jq -r '.verdict' "$out")" != "AMBIGUOUS" ]; then echo "FAIL: ambiguous verdict=$(jq -r .verdict "$out") (expected AMBIGUOUS)"; fail=1
  elif [ "$(jq '.candidates | length' "$out")" -lt 2 ]; then echo "FAIL: ambiguous candidates < 2"; fail=1
  else echo "PASS: ambiguous-match"
  fi
  cleanup_ctx "$rid"

  # Scenario 3: no-match
  rid="self-test-no-match"
  prepare_ctx "$rid"
  RUN_ID="$rid" \
  DESCRIPTION="kubernetes pod restart loop investigation" \
  MODE=feature \
    run_main 2>/dev/null
  out="$REPO_ROOT/.claude/skills/team/team-state/$rid/roadmap-tick-proposal.json"
  if [ "$(jq -r '.verdict' "$out")" != "NO_MATCH" ]; then echo "FAIL: no-match verdict=$(jq -r .verdict "$out") (expected NO_MATCH)"; fail=1
  elif [ "$(jq -r '.matched' "$out")" != "null" ]; then echo "FAIL: no-match leaked matched"; fail=1
  else echo "PASS: no-match"
  fi
  cleanup_ctx "$rid"

  # Scenario 4: chore-mode-skip
  rid="self-test-chore-skip"
  prepare_ctx "$rid"
  RUN_ID="$rid" \
  DESCRIPTION="Cost estimation per agent" \
  MODE=chore \
    run_main 2>/dev/null
  out="$REPO_ROOT/.claude/skills/team/team-state/$rid/roadmap-tick-proposal.json"
  if [ "$(jq -r '.verdict' "$out")" != "SKIP" ]; then echo "FAIL: chore-skip verdict=$(jq -r .verdict "$out") (expected SKIP)"; fail=1
  else echo "PASS: chore-mode-skip"
  fi
  cleanup_ctx "$rid"

  return $fail
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit $?
fi

run_main
