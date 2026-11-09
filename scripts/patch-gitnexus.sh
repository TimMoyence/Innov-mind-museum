#!/usr/bin/env bash

set -euo pipefail

GITNEXUS_BIN="$(command -v gitnexus 2>/dev/null || true)"
if [[ -z "$GITNEXUS_BIN" ]]; then
  echo "gitnexus not found in PATH — install it first with 'npm install -g gitnexus'" >&2
  exit 1
fi

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

if grep -q 'gitnexus/gitnexus-' "$AI_CONTEXT"; then
  make_backup_once

  sed -i '' "s|\\.claude/skills/gitnexus/gitnexus-|\\.claude/skills/gitnexus-|g" "$AI_CONTEXT"

  sed -i '' "s|path.join(repoPath, '.claude', 'skills', 'gitnexus')|path.join(repoPath, '.claude', 'skills')|g" "$AI_CONTEXT"

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

if grep -q "path.join(repoPath, 'AGENTS.md')" "$AI_CONTEXT"; then
  make_backup_once

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
