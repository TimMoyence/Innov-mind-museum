#!/bin/bash
# SSOT Sentinel — checks for hardcoded colors that should use design tokens
# Runs at Stop (end of each assistant turn)
#
# 3 alert levels:
#   [HARDCODED]  — exact SSOT color used inline instead of token import
#   [DERIVATIVE] — color within ΔE<30 of an SSOT color (drift from design system)
#   [NEW COLOR]  — color far from any SSOT color (intentional new palette?)

REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"
TOKENS_FILE="$REPO_ROOT/design-system/tokens/colors.ts"

[[ ! -f "$TOKENS_FILE" ]] && exit 0

# ── Extract SSOT hex colors ─────────────────────────────────────────────────
SSOT_COLORS=$(grep -oE "'#[0-9A-Fa-f]{6}'" "$TOKENS_FILE" | tr -d "'" | tr '[:lower:]' '[:upper:]' | sort -u)
[[ -z "$SSOT_COLORS" ]] && exit 0

# ── RGB distance function (awk) ─────────────────────────────────────────────
# Returns: "distance nearest_ssot_color" or "exact MATCH"
# Threshold: 30 = catches subtle hue/lightness shifts while ignoring unrelated colors
# (max euclidean RGB distance = ~441 for #000000 vs #FFFFFF)
check_color() {
  local color="$1"
  echo "$SSOT_COLORS" | awk -v c="$color" '
    function hex2dec(h) {
      h = toupper(h)
      n = 0
      for (i = 1; i <= length(h); i++) {
        d = index("0123456789ABCDEF", substr(h, i, 1)) - 1
        n = n * 16 + d
      }
      return n
    }
    BEGIN {
      cr = hex2dec(substr(c, 2, 2))
      cg = hex2dec(substr(c, 4, 2))
      cb = hex2dec(substr(c, 6, 2))
      min_dist = 999999
      nearest = ""
    }
    {
      sr = hex2dec(substr($0, 2, 2))
      sg = hex2dec(substr($0, 4, 2))
      sb = hex2dec(substr($0, 6, 2))
      dist = sqrt((cr-sr)^2 + (cg-sg)^2 + (cb-sb)^2)
      if (dist == 0) { print "exact " $0; exit }
      if (dist < min_dist) { min_dist = dist; nearest = $0 }
    }
    END {
      if (min_dist <= 30) print "derivative " nearest " " int(min_dist)
      else print "new " nearest " " int(min_dist)
    }
  '
}

# ── Get changed files ───────────────────────────────────────────────────────
CHANGED_FILES=$(cd "$REPO_ROOT" && git diff --name-only HEAD 2>/dev/null; cd "$REPO_ROOT" && git diff --name-only --cached 2>/dev/null; cd "$REPO_ROOT" && git ls-files --others --exclude-standard 2>/dev/null)
CHANGED_FILES=$(echo "$CHANGED_FILES" | sort -u | grep -E '\.(ts|tsx|css)$' | grep -E '^(museum-frontend|museum-web|museum-admin)/' | grep -v 'tokens\.generated' | grep -v 'node_modules')

[[ -z "$CHANGED_FILES" ]] && exit 0

# Skip universal base colors (not design decisions)
SKIP_COLORS="#000000 #FFFFFF #F8FAFC"

HARDCODED=""
DERIVATIVES=""
NEW_COLORS=""

while IFS= read -r file; do
  [[ -z "$file" || ! -f "$REPO_ROOT/$file" ]] && continue

  DIFF_OUTPUT=$(cd "$REPO_ROOT" && git diff HEAD -- "$file" 2>/dev/null | grep '^+' | grep -v '^+++')
  if [[ -z "$DIFF_OUTPUT" ]]; then
    DIFF_OUTPUT=$(cat "$REPO_ROOT/$file" 2>/dev/null)
  fi
  ADDED_COLORS=$(echo "$DIFF_OUTPUT" | grep -oE '#[0-9A-Fa-f]{6}' | tr '[:lower:]' '[:upper:]' | sort -u)
  [[ -z "$ADDED_COLORS" ]] && continue

  while IFS= read -r color; do
    [[ -z "$color" ]] && continue
    # Skip universal base colors
    echo "$SKIP_COLORS" | grep -qw "$color" && continue

    result=$(check_color "$color")
    kind=$(echo "$result" | awk '{print $1}')
    nearest=$(echo "$result" | awk '{print $2}')
    dist=$(echo "$result" | awk '{print $3}')

    case "$kind" in
      exact)
        line_info=$(cd "$REPO_ROOT" && grep -n -i "${color}" "$file" | head -1 | cut -c1-120)
        HARDCODED="${HARDCODED}\n  ${file}:${line_info} → use token import"
        ;;
      derivative)
        line_info=$(cd "$REPO_ROOT" && grep -n -i "${color}" "$file" | head -1 | cut -c1-120)
        DERIVATIVES="${DERIVATIVES}\n  ${file}:${line_info} → drift from ${nearest} (Δ=${dist})"
        ;;
      new)
        NEW_COLORS="${NEW_COLORS}\n  ${file}: ${color} (nearest SSOT: ${nearest}, Δ=${dist})"
        ;;
    esac
  done <<< "$ADDED_COLORS"
done <<< "$CHANGED_FILES"

# ── Report ──────────────────────────────────────────────────────────────────
if [[ -n "$HARDCODED" || -n "$DERIVATIVES" || -n "$NEW_COLORS" ]]; then
  echo "SSOT Sentinel report:"
  if [[ -n "$HARDCODED" ]]; then
    echo "  [HARDCODED] SSOT colors found inline (import from tokens.generated):"
    echo -e "$HARDCODED"
  fi
  if [[ -n "$DERIVATIVES" ]]; then
    echo "  [DERIVATIVE] Colors drifting from SSOT (use the exact SSOT token instead):"
    echo -e "$DERIVATIVES"
  fi
  if [[ -n "$NEW_COLORS" ]]; then
    echo "  [NEW COLOR] Unknown colors (add to design-system/tokens/colors.ts or use SSOT):"
    echo -e "$NEW_COLORS"
  fi
fi

exit 0
