#!/bin/bash
# pre-cycle-roadmap-load.sh — T1.6 ROADMAP_TEAM (auto-consolidation roadmap × /team).
#
# At Step 0 INIT, read both ROADMAP_PRODUCT.md + ROADMAP_TEAM.md, parse NOW
# section unticked items, emit team-state/$RUN_ID/roadmap-context.json.
#
# Inputs (env):
#   RUN_ID                  (required) — team-state run id (YYYY-MM-DD-slug)
#   ROADMAP_PRODUCT_PATH    (optional) — default docs/ROADMAP_PRODUCT.md
#   ROADMAP_TEAM_PATH       (optional) — default docs/ROADMAP_TEAM.md
#
# Optional flag:
#   --self-test             — 4 inline scenarios, exit 0 if all PASS.
#
# Exit: 0 always when not --self-test (degrade to verdict=WARN with empty arrays
#       on missing/unreadable roadmap — non-blocking, dispatch continues).
#       --self-test exits 1 on any FAIL.
#
# Output: team-state/$RUN_ID/roadmap-context.json
#   {
#     "loadedAt": "ISO ts",
#     "verdict":  "PASS" | "WARN",
#     "productItems": [{ "file":"...", "line":N, "id":"W1.1"|null, "text":"..." }],
#     "teamItems":    [...]
#   }

set -uo pipefail
# Force C locale (consistency with sibling hooks; awk/sort behave identically).
export LC_ALL=C LANG=C

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"

# ---------------------------------------------------------------------------
# Parse a ROADMAP file, emit JSON array of unticked items in `## NOW` section.
# Args: $1 = absolute path to roadmap file, $2 = "label" used as `file` field.
# Stdout: JSON array (compact). Stderr: nothing on success, 1-line on failure.
# ---------------------------------------------------------------------------
parse_roadmap() {
  local file="$1"
  local label="$2"
  if [ ! -r "$file" ]; then
    echo "[]"
    return 1
  fi
  awk -v file_label="$label" '
    BEGIN { in_now=0; first=1; parent=""; printf "[" }
    /^## / {
      if ($0 ~ /^## NOW([[:space:]]|$)/) { in_now=1; parent="" }
      else                                { in_now=0; parent="" }
      next
    }
    /^### / {
      if (in_now == 1) {
        parent=$0
        sub(/^### /, "", parent)
        gsub(/\\/, "\\\\", parent)
        gsub(/"/, "\\\"", parent)
        gsub(/\t/, "\\t", parent)
      }
      next
    }
    {
      if (in_now != 1) next
      if ($0 !~ /^[[:space:]]*- \[ \] /) next
      raw=$0
      sub(/^[[:space:]]*- \[ \] /, "", raw)
      id="null"
      text=raw
      if (match(raw, /^\*\*[A-Za-z0-9._-]+\*\*[[:space:]]*/)) {
        id_match=substr(raw, RSTART+2, RLENGTH-4-1)
        sub(/[[:space:]]+$/, "", id_match)
        id="\"" id_match "\""
        text=substr(raw, RSTART+RLENGTH)
      }
      gsub(/\\/, "\\\\", text)
      gsub(/"/, "\\\"", text)
      gsub(/\t/, "\\t", text)
      if (first==1) { first=0 } else { printf "," }
      printf "{\"file\":\"%s\",\"line\":%d,\"id\":%s,\"parentSection\":\"%s\",\"text\":\"%s\"}", file_label, NR, id, parent, text
    }
    END { printf "]" }
  ' "$file"
}

run_main() {
  : "${RUN_ID:?RUN_ID is required}"
  local product_path="${ROADMAP_PRODUCT_PATH:-$REPO_ROOT/docs/ROADMAP_PRODUCT.md}"
  local team_path="${ROADMAP_TEAM_PATH:-$REPO_ROOT/docs/ROADMAP_TEAM.md}"
  local out_dir="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
  mkdir -p "$out_dir"
  local out_file="$out_dir/roadmap-context.json"

  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local verdict="PASS"
  local product_json team_json
  product_json=$(parse_roadmap "$product_path" "${product_path#$REPO_ROOT/}") || verdict="WARN"
  team_json=$(parse_roadmap "$team_path" "${team_path#$REPO_ROOT/}") || verdict="WARN"

  # Build final JSON via jq (validates structure).
  jq -n \
    --arg ts "$ts" \
    --arg verdict "$verdict" \
    --argjson product "$product_json" \
    --argjson team "$team_json" \
    '{loadedAt:$ts, verdict:$verdict, productItems:$product, teamItems:$team}' \
    > "$out_file"

  local n_product n_team
  n_product=$(jq '.productItems | length' "$out_file")
  n_team=$(jq '.teamItems | length' "$out_file")
  echo "pre-cycle-roadmap-load: verdict=$verdict items_product=$n_product items_team=$n_team out=$out_file" >&2
  return 0
}

# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------
run_self_test() {
  local tmp
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  local fail=0

  # Fixture: minimal product roadmap.
  cat > "$tmp/product.md" <<'EOF'
# ROADMAP PRODUCT

## North Star

(prose)

## NOW — Sprint launch

- [ ] **W1.1** First product item
- [x] Already done
- [ ] **W1.2** Second product item

## NEXT

- [ ] Future feature
EOF

  cat > "$tmp/team.md" <<'EOF'
# ROADMAP TEAM

## NOW

- [ ] **T1.1** Cost estimation
EOF

  # Scenario 1: clean-load
  RUN_ID="self-test-clean-load" \
  ROADMAP_PRODUCT_PATH="$tmp/product.md" \
  ROADMAP_TEAM_PATH="$tmp/team.md" \
    run_main 2>/dev/null
  local out="$REPO_ROOT/.claude/skills/team/team-state/self-test-clean-load/roadmap-context.json"
  if [ ! -f "$out" ]; then echo "FAIL: clean-load missing output"; fail=1
  elif [ "$(jq '.productItems | length' "$out")" != "2" ]; then echo "FAIL: clean-load expected 2 product items, got $(jq '.productItems | length' "$out")"; fail=1
  elif [ "$(jq '.teamItems | length' "$out")" != "1" ]; then echo "FAIL: clean-load expected 1 team item"; fail=1
  elif [ "$(jq -r '.productItems[0].id' "$out")" != "W1.1" ]; then echo "FAIL: clean-load expected id W1.1"; fail=1
  elif [ "$(jq -r '.verdict' "$out")" != "PASS" ]; then echo "FAIL: clean-load expected verdict PASS"; fail=1
  else echo "PASS: clean-load"
  fi
  rm -rf "$REPO_ROOT/.claude/skills/team/team-state/self-test-clean-load"

  # Scenario 2: missing-product
  RUN_ID="self-test-missing-product" \
  ROADMAP_PRODUCT_PATH="/tmp/nonexistent-roadmap-xyz.md" \
  ROADMAP_TEAM_PATH="$tmp/team.md" \
    run_main 2>/dev/null
  out="$REPO_ROOT/.claude/skills/team/team-state/self-test-missing-product/roadmap-context.json"
  if [ ! -f "$out" ]; then echo "FAIL: missing-product no output"; fail=1
  elif [ "$(jq -r '.verdict' "$out")" != "WARN" ]; then echo "FAIL: missing-product verdict not WARN"; fail=1
  elif [ "$(jq '.productItems | length' "$out")" != "0" ]; then echo "FAIL: missing-product items not empty"; fail=1
  elif [ "$(jq '.teamItems | length' "$out")" != "1" ]; then echo "FAIL: missing-product team items lost"; fail=1
  else echo "PASS: missing-product"
  fi
  rm -rf "$REPO_ROOT/.claude/skills/team/team-state/self-test-missing-product"

  # Scenario 3: missing-team
  RUN_ID="self-test-missing-team" \
  ROADMAP_PRODUCT_PATH="$tmp/product.md" \
  ROADMAP_TEAM_PATH="/tmp/nonexistent-team-xyz.md" \
    run_main 2>/dev/null
  out="$REPO_ROOT/.claude/skills/team/team-state/self-test-missing-team/roadmap-context.json"
  if [ ! -f "$out" ]; then echo "FAIL: missing-team no output"; fail=1
  elif [ "$(jq -r '.verdict' "$out")" != "WARN" ]; then echo "FAIL: missing-team verdict not WARN"; fail=1
  elif [ "$(jq '.teamItems | length' "$out")" != "0" ]; then echo "FAIL: missing-team items not empty"; fail=1
  else echo "PASS: missing-team"
  fi
  rm -rf "$REPO_ROOT/.claude/skills/team/team-state/self-test-missing-team"

  # Scenario 4: cocked-skipped (the [x] line must NOT be in productItems)
  RUN_ID="self-test-cocked-skipped" \
  ROADMAP_PRODUCT_PATH="$tmp/product.md" \
  ROADMAP_TEAM_PATH="$tmp/team.md" \
    run_main 2>/dev/null
  out="$REPO_ROOT/.claude/skills/team/team-state/self-test-cocked-skipped/roadmap-context.json"
  local checked
  checked=$(jq -r '.productItems[].text' "$out" | grep -c "Already done" || true)
  if [ "$checked" != "0" ]; then echo "FAIL: cocked-skipped leaked [x] item"; fail=1
  else echo "PASS: cocked-skipped"
  fi
  rm -rf "$REPO_ROOT/.claude/skills/team/team-state/self-test-cocked-skipped"

  return $fail
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit $?
fi

run_main
