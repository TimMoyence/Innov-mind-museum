# PLAN 01 — Docs Cleanup

**Phase** : 1 (Quick Win)
**Effort** : 1-2 jours
**Pipeline /team** : micro
**Prérequis** : Aucun
**Débloque** : P02, P03

## Context

Le référentiel `docs/` compte 85 fichiers `.md`. L'audit a identifié 7 docs obsolètes (Sprint 0 conclu, squelettes vides, roadmaps archivées) + 1 duplicata, 3 runbooks éclatés, et aucun index central. Polluer le namespace ralentit la découverte et diffuse l'attention.

**Objectif** : -8 docs obsolètes, 3 runbooks mergés en 1, +2 docs d'index (ROADMAP_ACTIVE, DOCS_INDEX). Gain : lisibilité +30%, découverte +2 clics plus rapide.

## Actions

### 1. Supprimer docs obsolètes

| Fichier | Raison |
|---|---|
| `docs/archive/roadmaps/V2_MUSEUM_WALK_STRATEGY.md` | Remplacé par V3_REVIEW_AND_PLAN (2026-03-25 → 2026-04-15) |
| `docs/archive/roadmaps/MASTER_ROADMAP_V2.md` | Duplicata stale de `/docs/V1_Sprint/MASTER_ROADMAP_V2.md` |
| `docs/walk/SPRINT_4.md` | Squelette vide (1.4K) |
| `docs/walk/SPRINT_5.md` | Squelette vide (1.7K) |
| `docs/FEATURE_MUSEUM_WALK.md` | Référence V1 SPRINT walk conclu, remplacé par `docs/walk/` |
| `docs/archive/fullcodebase-analyse/` (dossier 11 fichiers) | Analyse Sprint 0 conclue, intégrée dans MASTER_ROADMAP_V2 |

Commande :
```bash
cd <repo-root>
rm docs/archive/roadmaps/V2_MUSEUM_WALK_STRATEGY.md
rm docs/archive/roadmaps/MASTER_ROADMAP_V2.md
rm docs/walk/SPRINT_4.md
rm docs/walk/SPRINT_5.md
rm docs/FEATURE_MUSEUM_WALK.md
rm -rf docs/archive/fullcodebase-analyse/
```

### 2. Merger 3 runbooks en `docs/OPS_DEPLOYMENT.md`

Sources :
- `docs/DEPLOYMENT_STEP_BY_STEP.md` (14.3K) — déploiement manuel
- `docs/RUNBOOK.md` — runbook ops courant
- `docs/RUNBOOK_AUTO_ROLLBACK.md` — cas rollback automatique

Structure cible `docs/OPS_DEPLOYMENT.md` :
```markdown
# OPS — Déploiement

## Quick Reference (déploiement courant)
## Déploiement manuel (step-by-step)
## Runbook incidents
## Runbook auto-rollback
## Troubleshooting
```

Après merge : supprimer les 3 sources.

### 3. Créer `docs/ROADMAP_ACTIVE.md`

Alias lisible pour `docs/archive/roadmaps/V3_REVIEW_AND_PLAN.md` (roadmap V3 actuelle).

Contenu minimal :
```markdown
# Roadmap Active V3

> Source : voir `docs/archive/roadmaps/V3_REVIEW_AND_PLAN.md` pour le détail.
> Ce fichier est un résumé exécutif mis à jour à chaque sprint.

## Sprint courant
[auto-sync avec PROGRESS_TRACKER.md Sprint actif]

## Prochains Sprints
[liste court terme]

## Vision V3
[3-5 piliers]
```

### 4. Créer `docs/DOCS_INDEX.md` — table vérité

Index central liant docs ↔ protocoles SDLC ↔ skills Claude Code.

Structure :
```markdown
# Docs Index

## Tracking
- PROGRESS_TRACKER — `docs/V1_Sprint/PROGRESS_TRACKER.md`
- SPRINT_LOG — `docs/V1_Sprint/SPRINT_LOG.md`
- ROADMAP_ACTIVE — `docs/ROADMAP_ACTIVE.md`

## Plans Modulaires
- Tous dans `docs/plans/PLAN_XX_*.md`

## Opérations
- DEPLOYMENT — `docs/OPS_DEPLOYMENT.md`
- CI_CD_SECRETS — `docs/CI_CD_SECRETS.md`
- DB_BACKUP_RESTORE — `docs/DB_BACKUP_RESTORE.md`

## Produit
- PRODUCT_STATE_OVERVIEW — `docs/PRODUCT_STATE_OVERVIEW.md`
- FEATURE_KNOWLEDGE_BASE_WIKIDATA — `docs/FEATURE_KNOWLEDGE_BASE_WIKIDATA.md`

## Legal / Compliance
- privacy-policy.html — `docs/privacy-policy.html`
- GOOGLE_PLAY_DATA_SAFETY — `docs/GOOGLE_PLAY_DATA_SAFETY.md`

## Skills /team
- SKILL.md — `.claude/skills/team/SKILL.md`
- team-sdlc-index — `.claude/skills/team/team-sdlc-index.md` (créé par P02)

## GitNexus
- AGENTS.md — `AGENTS.md` (racine)
```

### 5. Vérifier liens cassés

Après chaque suppression :
```bash
grep -r "FEATURE_MUSEUM_WALK" . --include="*.md" --exclude-dir=node_modules
grep -r "fullcodebase-analyse" . --include="*.md" --exclude-dir=node_modules
grep -r "RUNBOOK_AUTO_ROLLBACK" . --include="*.md" --exclude-dir=node_modules
grep -r "DEPLOYMENT_STEP_BY_STEP" . --include="*.md" --exclude-dir=node_modules
```

Si match trouvé → update le lien vers le nouveau fichier.

### 6. Mettre à jour CLAUDE.md

Vérifier la section "Deployment" dans `/CLAUDE.md` — remplacer référence à `docs/DEPLOYMENT_STEP_BY_STEP.md` par `docs/OPS_DEPLOYMENT.md`.

## Verification

```bash
# Compter avant / après
find docs -name "*.md" -not -path "*/archive/fullcodebase-analyse/*" | wc -l
# avant: 85 / après: ~77

# Liens cassés
grep -r "FEATURE_MUSEUM_WALK\|fullcodebase-analyse\|RUNBOOK_AUTO_ROLLBACK" . \
  --include="*.md" --exclude-dir=node_modules --exclude-dir=.git
# attendu: 0 résultat

# Nouveaux fichiers existent
ls docs/OPS_DEPLOYMENT.md docs/ROADMAP_ACTIVE.md docs/DOCS_INDEX.md

# Git diff résumé
git status docs/
```

## Fichiers Critiques

- `docs/DEPLOYMENT_STEP_BY_STEP.md` (merger puis supprimer)
- `docs/RUNBOOK.md` (merger puis supprimer)
- `docs/RUNBOOK_AUTO_ROLLBACK.md` (merger puis supprimer)
- `docs/archive/fullcodebase-analyse/` (supprimer entier)
- `docs/walk/SPRINT_4.md` + `SPRINT_5.md` (supprimer)
- `docs/FEATURE_MUSEUM_WALK.md` (supprimer)
- `docs/archive/roadmaps/MASTER_ROADMAP_V2.md` (supprimer - duplicata)
- `docs/archive/roadmaps/V2_MUSEUM_WALK_STRATEGY.md` (supprimer)
- `CLAUDE.md` (mise à jour référence DEPLOYMENT)
- `docs/V1_Sprint/PROGRESS_TRACKER.md` (update référence `ROADMAP_ACTIVE`)

## Commit Plan

1 commit par étape pour traçabilité :
```
docs: merge 3 runbooks into OPS_DEPLOYMENT.md
docs: remove obsolete Sprint 0 fullcodebase-analyse (11 files)
docs: remove empty walk sprints 4/5 and museum-walk feature doc
docs: remove duplicate archived roadmaps
docs: create ROADMAP_ACTIVE.md and DOCS_INDEX.md
docs: update CLAUDE.md references
```

## Risques

- **Faible** : suppressions sont toutes sur fichiers archives/vides/duplicata
- Backup : git history préserve tout, rollback `git revert` possible

## Done When

- [ ] 8 docs obsolètes supprimées
- [ ] 3 runbooks → 1 OPS_DEPLOYMENT.md
- [ ] ROADMAP_ACTIVE.md créé
- [ ] DOCS_INDEX.md créé
- [ ] CLAUDE.md à jour
- [ ] Aucun lien cassé (grep verif)
- [ ] Commits atomiques pushés
