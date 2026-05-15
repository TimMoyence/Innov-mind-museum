#!/usr/bin/env bash
# Patch gitnexus npm binary in place — fixes 2 upstream behaviors that don't
# fit Musaium's setup. Both patches are idempotent.
#
# Patch A — Top-level skill install
#   Why: Claude Code skill loader does not recurse into subdirs — it only
#   discovers .claude/skills/*/SKILL.md (one level deep). Default gitnexus
#   install path .claude/skills/gitnexus/gitnexus-X/SKILL.md is two levels
#   deep and never auto-loads as Skill tool.
#
# Patch B — Never write AGENTS.md (CLAUDE.md only)
#   Why: gitnexus analyze re-injects a ~1500-token block into AGENTS.md
#   every run, even though AGENTS.md is configured as a thin pointer to
#   CLAUDE.md (P1-16 audit 2026-05-12). We've been deleting the block by
#   hand after each analyze — patching at source is cleaner.
#   Upstream has --skip-agents-md but it ALSO skips CLAUDE.md (verified at
#   ai-context.js:250-263). We patch the binary to keep CLAUDE.md write
#   and remove AGENTS.md write only.
#
# Run after every `npm install -g gitnexus` / `npm update -g gitnexus`.
# Verify:
#   grep -c 'gitnexus/gitnexus-' "$AI_CONTEXT"        # must return 0 (A)
#   grep -c "path.join(repoPath, 'AGENTS.md')" "$AI_CONTEXT"  # must return 0 (B)

set -euo pipefail

GITNEXUS_BIN="$(command -v gitnexus 2>/dev/null || true)"
if [[ -z "$GITNEXUS_BIN" ]]; then
  echo "gitnexus not found in PATH — install it first with 'npm install -g gitnexus'" >&2
  exit 1
fi

# Resolve symlink chain to locate the package root
RESOLVED_BIN="$(perl -e 'use Cwd "abs_path"; print abs_path($ARGV[0])' "$GITNEXUS_BIN")"
GITNEXUS_PKG_ROOT="$(cd "$(dirname "$RESOLVED_BIN")/../.." && pwd)"
AI_CONTEXT="$GITNEXUS_PKG_ROOT/dist/cli/ai-context.js"

if [[ ! -f "$AI_CONTEXT" ]]; then
  echo "Could not locate $AI_CONTEXT — gitnexus internals may have moved." >&2
  exit 1
fi

backup_made=0
make_backup_once() {
  if [[ "$backup_made" -eq 0 ]]; then
    cp "$AI_CONTEXT" "$AI_CONTEXT.bak.$(date +%s)"
    backup_made=1
  fi
}

# ─── Patch A — Top-level skill install ─────────────────────────────────────
if grep -q 'gitnexus/gitnexus-' "$AI_CONTEXT"; then
  make_backup_once

  # 1) Markdown table paths in AGENTS.md / CLAUDE.md
  sed -i '' "s|\\.claude/skills/gitnexus/gitnexus-|\\.claude/skills/gitnexus-|g" "$AI_CONTEXT"

  # 2) skillsDir (install destination)
  sed -i '' "s|path.join(repoPath, '.claude', 'skills', 'gitnexus')|path.join(repoPath, '.claude', 'skills')|g" "$AI_CONTEXT"

  # 3) installed-skills log line
  sed -i '' "s|\`\\.claude/skills/gitnexus/ (\${installedSkills.length} skills)\`|\`.claude/skills/ (\${installedSkills.length} gitnexus skills)\`|g" "$AI_CONTEXT"

  remaining=$(grep -c 'gitnexus/gitnexus-' "$AI_CONTEXT" || true)
  if [[ "$remaining" -ne 0 ]]; then
    echo "Patch A incomplete — $remaining nested references remain in $AI_CONTEXT" >&2
    exit 1
  fi
  echo "Patch A applied — gitnexus skills now install top-level in .claude/skills/"
else
  echo "Patch A already applied (no nested paths in $AI_CONTEXT)."
fi

# ─── Patch B — Never write AGENTS.md (CLAUDE.md only) ──────────────────────
if grep -q "path.join(repoPath, 'AGENTS.md')" "$AI_CONTEXT"; then
  make_backup_once

  # Multi-line regex — slurp file with BEGIN{undef $/;}, match the 4 lines
  # that write AGENTS.md, replace with nothing. The CLAUDE.md write stays.
  perl -i -pe '
    BEGIN { undef $/; }
    s|^\s*//\s*Create AGENTS\.md[^\n]*\n\s*const agentsPath = path\.join\(repoPath, '"'"'AGENTS\.md'"'"'\);\n\s*const agentsResult = await upsertGitNexusSection\(agentsPath, content\);\n\s*createdFiles\.push\(`AGENTS\.md \(\$\{agentsResult\}\)`\);\n||sm;
  ' "$AI_CONTEXT"

  remaining_b=$(grep -c "path.join(repoPath, 'AGENTS.md')" "$AI_CONTEXT" || true)
  if [[ "$remaining_b" -ne 0 ]]; then
    echo "Patch B incomplete — AGENTS.md write still present in $AI_CONTEXT" >&2
    exit 1
  fi
  echo "Patch B applied — gitnexus analyze will no longer write AGENTS.md (CLAUDE.md still updated)."
else
  echo "Patch B already applied (no AGENTS.md write in $AI_CONTEXT)."
fi

echo "Done."
