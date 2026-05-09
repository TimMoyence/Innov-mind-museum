#!/usr/bin/env bash
# Patch gitnexus npm binary so skills install top-level in .claude/skills/
# instead of nested under .claude/skills/gitnexus/.
#
# Why: Claude Code skill loader does not recurse into subdirs — it only
# discovers .claude/skills/*/SKILL.md (one level deep). The default gitnexus
# install path .claude/skills/gitnexus/gitnexus-X/SKILL.md is two levels deep
# and never auto-loads as Skill tool.
#
# Run after every `npm install -g gitnexus` / `npm update -g gitnexus`.
# Verify with: grep -c 'gitnexus/gitnexus-' "$AI_CONTEXT" (must return 0).

set -euo pipefail

GITNEXUS_BIN="$(command -v gitnexus 2>/dev/null || true)"
if [[ -z "$GITNEXUS_BIN" ]]; then
  echo "gitnexus not found in PATH — install it first with 'npm install -g gitnexus'" >&2
  exit 1
fi

# Resolve symlink chain to locate the package root
# (npm puts the bin at <prefix>/bin/gitnexus -> ../lib/node_modules/gitnexus/dist/cli/index.js)
RESOLVED_BIN="$(perl -e 'use Cwd "abs_path"; print abs_path($ARGV[0])' "$GITNEXUS_BIN")"
GITNEXUS_PKG_ROOT="$(cd "$(dirname "$RESOLVED_BIN")/../.." && pwd)"
AI_CONTEXT="$GITNEXUS_PKG_ROOT/dist/cli/ai-context.js"

if [[ ! -f "$AI_CONTEXT" ]]; then
  echo "Could not locate $AI_CONTEXT — gitnexus internals may have moved." >&2
  exit 1
fi

if ! grep -q 'gitnexus/gitnexus-' "$AI_CONTEXT"; then
  echo "Patch already applied (no nested paths in $AI_CONTEXT)."
  exit 0
fi

cp "$AI_CONTEXT" "$AI_CONTEXT.bak.$(date +%s)"

# 1) Markdown table paths in AGENTS.md / CLAUDE.md
sed -i '' "s|\\.claude/skills/gitnexus/gitnexus-|\\.claude/skills/gitnexus-|g" "$AI_CONTEXT"

# 2) skillsDir (install destination)
sed -i '' "s|path.join(repoPath, '.claude', 'skills', 'gitnexus')|path.join(repoPath, '.claude', 'skills')|g" "$AI_CONTEXT"

# 3) installed-skills log line
sed -i '' "s|\`\\.claude/skills/gitnexus/ (\${installedSkills.length} skills)\`|\`.claude/skills/ (\${installedSkills.length} gitnexus skills)\`|g" "$AI_CONTEXT"

remaining=$(grep -c 'gitnexus/gitnexus-' "$AI_CONTEXT" || true)
if [[ "$remaining" -ne 0 ]]; then
  echo "Patch incomplete — $remaining nested references remain in $AI_CONTEXT" >&2
  exit 1
fi

echo "Patched $AI_CONTEXT — gitnexus now writes skills to top-level .claude/skills/"
