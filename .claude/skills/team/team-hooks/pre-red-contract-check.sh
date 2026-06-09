#!/bin/bash
# pre-red-contract-check.sh — UFR-022 Gate A (test-contract phase closing gate).
#
# Runs at the end of Step 4.6 (test-contract), BEFORE red. Machine-verifies that
# test-analyst produced a complete test-contract.md:
#   1. file exists
#   2. has `## Couverture` and `## Use-cases` headers
#   3. coverage matrix has NO empty cell (every AC-x → >=1 UC)
#   4. every `### UC-<n>` block has all 7 fields + a valid Tier
#
# Tier vocabulary: unit | integration | contract | e2e (ADR-012).
#
# Usage: RUN_ID=YYYY-MM-DD-slug .claude/skills/team/team-hooks/pre-red-contract-check.sh
# Exit: 0 PASS | 1 FAIL.  Self-test: --self-test.
# bash 3.2-safe (no mapfile; while-read over redirect, not pipe).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

REQUIRED_FIELDS="Couvre Catégorie Tier Factory Given When Then Observable"
VALID_TIERS="unit integration contract e2e"

# --- coverage matrix: returns non-empty string (the offending rows) if any AC cell is empty
check_coverage() {
  local file="$1"
  local in_cov=0 empty=""
  while IFS= read -r line; do
    case "$line" in
      '## Couverture'*) in_cov=1; continue ;;
    esac
    if [ "$in_cov" = 1 ]; then
      case "$line" in
        '## '*) break ;;
        '|'*AC-*)
          local col2
          col2=$(printf '%s' "$line" | awk -F'|' '{print $3}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
          case "$col2" in
            ''|'{{'*|'—'|'-'|'TBD'|'tbd') empty="${empty}$(printf '%s' "$line" | sed 's/^[[:space:]]*//') / " ;;
          esac
          ;;
      esac
    fi
  done < "$file"
  printf '%s' "$empty"
}

# --- per-UC field + tier validation. Echoes "<missing-report>|<bad-tier-report>".
check_use_cases() {
  local file="$1"
  local in_sec=0 in_uc=0 uc=""
  local fc=0 fcat=0 ft=0 ff=0 fg=0 fw=0 fth=0 fo=0 tier="" ucn=0
  local missing="" badtier=""
  _finalize() {
    [ "$in_uc" = 1 ] || return 0
    ucn=$((ucn + 1))
    local miss=""
    [ "$fc" = 1 ]   || miss="${miss}Couvre "
    [ "$fcat" = 1 ] || miss="${miss}Catégorie "
    [ "$ft" = 1 ]   || miss="${miss}Tier "
    [ "$ff" = 1 ]   || miss="${miss}Factory "
    [ "$fg" = 1 ]   || miss="${miss}Given "
    [ "$fw" = 1 ]   || miss="${miss}When "
    [ "$fth" = 1 ]  || miss="${miss}Then "
    [ "$fo" = 1 ]   || miss="${miss}Observable "
    [ -n "$miss" ] && missing="${missing}${uc}{${miss% }} "
    if [ -n "$tier" ]; then
      local ok=0 t
      for t in $VALID_TIERS; do [ "$tier" = "$t" ] && ok=1; done
      [ "$ok" = 0 ] && badtier="${badtier}${uc}(tier=${tier}) "
    elif [ "$ft" = 1 ]; then
      badtier="${badtier}${uc}(tier=empty) "
    fi
  }
  while IFS= read -r line; do
    case "$line" in
      '## Use-cases'*) in_sec=1; continue ;;
    esac
    [ "$in_sec" = 1 ] || continue
    case "$line" in
      '## '*) _finalize; in_sec=0; in_uc=0; continue ;;
      '### UC-'*)
        _finalize
        in_uc=1; uc="${line#'### '}"; uc="${uc%% —*}"
        fc=0; fcat=0; ft=0; ff=0; fg=0; fw=0; fth=0; fo=0; tier=""
        continue ;;
    esac
    [ "$in_uc" = 1 ] || continue
    case "$line" in
      *'**Couvre**'*)     fc=1 ;;
      *'**Catégorie**'*)  fcat=1 ;;
      *'**Tier**'*)       ft=1; tier=$(printf '%s' "$line" | sed -E 's/.*\*\*Tier\*\*[[:space:]]*:[[:space:]]*([a-zA-Z]+).*/\1/') ;;
      *'**Factory**'*)    ff=1 ;;
      *'**Given**'*)      fg=1 ;;
      *'**When**'*)       fw=1 ;;
      *'**Then**'*)       fth=1 ;;
      *'**Observable**'*) fo=1 ;;
    esac
  done < "$file"
  _finalize
  if [ "$ucn" = 0 ]; then
    printf 'NO-UC|'
    return
  fi
  printf '%s|%s' "$missing" "$badtier"
}

# --- core check: prints "<VERDICT>|<details>", RC 0/1 ----------------------
check() {
  local file="$1"
  if [ ! -f "$file" ]; then
    printf 'FAIL|test-contract.md missing\n'; return 1
  fi
  if ! grep -qE '^## Couverture' "$file"; then
    printf 'FAIL|missing `## Couverture` header\n'; return 1
  fi
  if ! grep -qE '^## Use-cases' "$file"; then
    printf 'FAIL|missing `## Use-cases` header\n'; return 1
  fi
  local empty_cov
  empty_cov=$(check_coverage "$file")
  if [ -n "$empty_cov" ]; then
    printf 'FAIL|empty coverage cell(s): %s\n' "${empty_cov% / }"; return 1
  fi
  local uc_out missing badtier
  uc_out=$(check_use_cases "$file")
  case "$uc_out" in
    'NO-UC|') printf 'FAIL|no `### UC-<n>` blocks found\n'; return 1 ;;
  esac
  missing="${uc_out%%|*}"
  badtier="${uc_out#*|}"
  if [ -n "$missing" ] || [ -n "$badtier" ]; then
    printf 'FAIL|incomplete UC(s) missing:[%s] bad-tier:[%s]\n' "${missing% }" "${badtier% }"
    return 1
  fi
  printf 'PASS|contract complete (coverage full, all UC fields + valid tiers)\n'
  return 0
}

# --- self-test -------------------------------------------------------------
self_test() {
  local TMP; TMP=$(mktemp -d); trap 'rm -rf "$TMP"' RETURN
  local PASS=0 FAIL=0
  _run() {
    local label="$1" expect="$2" file="$3"
    local out v; out=$(check "$file"); v="${out%%|*}"
    if [ "$v" = "$expect" ]; then PASS=$((PASS+1)); printf '  [PASS] %-28s -> %s\n' "$label" "$v"
    else FAIL=$((FAIL+1)); printf '  [FAIL] %-28s expected %s got %s (%s)\n' "$label" "$expect" "$v" "$out"; fi
  }
  # complete contract
  cat > "$TMP/ok.md" <<'EOF'
# Test Contract
## Couverture
| Critère (spec AC) | Use-cases couvrants |
|-------------------|---------------------|
| AC-1              | UC-1, UC-2          |
## Use-cases
### UC-1 — happy
- **Couvre**     : AC-1
- **Catégorie**  : happy
- **Tier**       : unit
- **Factory**    : makeUser()
- **Given**      : x
- **When**       : y
- **Then**       : z
- **Observable** : status=200
### UC-2 — error
- **Couvre**     : AC-1
- **Catégorie**  : error
- **Tier**       : integration
- **Factory**    : makeUser()
- **Given**      : x
- **When**       : y
- **Then**       : z
- **Observable** : status=402
EOF
  _run "complete" "PASS" "$TMP/ok.md"

  # empty coverage cell
  cat > "$TMP/empty-cov.md" <<'EOF'
# Test Contract
## Couverture
| Critère (spec AC) | Use-cases couvrants |
|-------------------|---------------------|
| AC-1              |                     |
## Use-cases
### UC-1 — happy
- **Couvre**     : AC-1
- **Catégorie**  : happy
- **Tier**       : unit
- **Factory**    : makeUser()
- **Given**      : x
- **When**       : y
- **Then**       : z
- **Observable** : ok
EOF
  _run "empty-coverage-cell" "FAIL" "$TMP/empty-cov.md"

  # missing field (no Observable)
  cat > "$TMP/missing-field.md" <<'EOF'
# Test Contract
## Couverture
| Critère (spec AC) | Use-cases couvrants |
|-------------------|---------------------|
| AC-1              | UC-1                |
## Use-cases
### UC-1 — happy
- **Couvre**     : AC-1
- **Catégorie**  : happy
- **Tier**       : unit
- **Factory**    : makeUser()
- **Given**      : x
- **When**       : y
- **Then**       : z
EOF
  _run "missing-observable" "FAIL" "$TMP/missing-field.md"

  # invalid tier
  cat > "$TMP/bad-tier.md" <<'EOF'
# Test Contract
## Couverture
| Critère (spec AC) | Use-cases couvrants |
|-------------------|---------------------|
| AC-1              | UC-1                |
## Use-cases
### UC-1 — happy
- **Couvre**     : AC-1
- **Catégorie**  : happy
- **Tier**       : smoke
- **Factory**    : makeUser()
- **Given**      : x
- **When**       : y
- **Then**       : z
- **Observable** : ok
EOF
  _run "invalid-tier" "FAIL" "$TMP/bad-tier.md"

  # no UC blocks
  cat > "$TMP/no-uc.md" <<'EOF'
# Test Contract
## Couverture
| Critère (spec AC) | Use-cases couvrants |
|-------------------|---------------------|
| AC-1              | UC-1                |
## Use-cases
EOF
  _run "no-uc-blocks" "FAIL" "$TMP/no-uc.md"

  # missing file
  _run "missing-file" "FAIL" "$TMP/does-not-exist.md"

  printf 'self-test: %d pass, %d fail\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
}

[ "${1:-}" = "--self-test" ] && { self_test; exit $?; }

RUN_ID="${RUN_ID:-}"
[ -z "$RUN_ID" ] && { echo "pre-red-contract-check: RUN_ID unset — skip"; exit 0; }
STATE_DIR="$REPO_ROOT/.claude/skills/team/team-state/$RUN_ID"
[ -d "$STATE_DIR" ] || { echo "pre-red-contract-check: STATE_DIR missing — skip"; exit 0; }

CONTRACT="$STATE_DIR/test-contract.md"
OUT=$(check "$CONTRACT"); RC=$?
VERDICT="${OUT%%|*}"; DETAILS="${OUT#*|}"
echo "pre-red-contract-check: $VERDICT (${DETAILS%$'\n'})"

if [ "$RC" -ne 0 ]; then
  STORY="$STATE_DIR/STORY.md"
  if [ -f "$STORY" ]; then
    {
      printf '\n## gate-A test-contract — pre-red-contract-check — %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      printf -- 'FAIL — %s\n' "${DETAILS%$'\n'}"
      printf -- 'Re-spawn fresh test-analyst (phase=test-contract) to complete the contract.\n'
    } >> "$STORY"
  fi
fi
exit "$RC"
