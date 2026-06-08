#!/usr/bin/env bash
# gitnexus-skills-refresh.sh
# Boucle d'amélioration continue déclenchée APRÈS `git commit` (PostToolUse, settings.json).
# Le code vient de changer → le graphe GitNexus + les cartes de cluster sont périmés.
#
# Séquence (entièrement en arrière-plan, jamais bloquante) :
#   1. npx gitnexus analyze          → ré-indexe le knowledge graph
#   2. gitnexus analyze --skills     → régénère .claude/skills/generated/<cluster>/SKILL.md
#   3. gen-cluster-skills-index.mjs  → reconstruit l'index routable + logue le diff des clusters
#
# L'« intégration à /team » est automatique : /team lit l'index régénéré (cf.
# team-protocols/gitnexus-integration.md § CLUSTER SKILLS). Les fichiers régénérés
# (cartes + index, tracked) restent dans le working tree et sont absorbés au prochain commit.
#
# Tout échec est toléré (|| true) : ce hook ne doit JAMAIS interrompre un commit.
set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT" || exit 0

LOG="/tmp/gitnexus-skills-refresh-$(date +%s).log"

{
  echo "=== gitnexus-skills-refresh @ $(date -u +%Y-%m-%dT%H:%M:%SZ) (commit $(git rev-parse --short HEAD 2>/dev/null)) ==="
  echo "--- [1/3] npx gitnexus analyze ---"
  npx gitnexus analyze 2>&1 || echo "WARN: gitnexus analyze a échoué (toléré)"
  echo "--- [2/3] gitnexus analyze --skills ---"
  gitnexus analyze --skills 2>&1 || echo "WARN: gitnexus analyze --skills a échoué (toléré)"
  echo "--- [3/3] gen-cluster-skills-index.mjs ---"
  node scripts/gen-cluster-skills-index.mjs 2>&1 || echo "WARN: génération de l'index a échoué (toléré)"
  echo "=== fin ($LOG) ==="
} >"$LOG" 2>&1 &

disown 2>/dev/null || true
exit 0
