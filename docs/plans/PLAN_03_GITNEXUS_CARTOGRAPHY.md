# PLAN 03 — GitNexus Cartography Refresh

**Phase** : 1 (Quick Win)
**Effort** : 0.5 jour
**Pipeline /team** : micro
**Prérequis** : Aucun
**Débloque** : P04, P06, P08, P12 (tous refactors qui bénéficient d'un index fresh)

## Context

GitNexus est la couche d'intelligence code du monorepo : 6 MCP tools actifs (query, context, impact, detect_changes, rename, cypher), 7 skills gitnexus-* documentés. L'audit confirme que l'index est **frais** (post-commit hook actif) mais n'a pas été validé sur les 3 apps en même temps (BE + mobile + web + design-system). Avant les refactors Phase 2, on veut une cartographie fraîche + une checklist d'usage pour chaque skill gitnexus-*.

**Objectif** : Re-index monorepo complet, valider les 6 MCP tools, valider les 7 skills gitnexus-* avec 1 cas d'usage réel par skill, détecter écarts AGENTS.md ↔ réalité.

## Actions

### 1. Re-index monorepo complet

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
gitnexus analyze                       # incremental, si hook OK
gitnexus status                        # vérifier fraîcheur
gitnexus list-repos                    # confirmer InnovMind mappé
```

Si index stale ou corrupt :
```bash
gitnexus clean                         # purge index
gitnexus analyze --full                # full reindex
```

Métriques à noter :
- Nombre de fichiers indexés
- Nombre de symboles (functions, classes, types)
- Durée analyze
- Nombre de clusters détectés

### 2. Valider les 6 MCP tools

Pour chacun, un test réel :

| Tool | Test |
|---|---|
| `query` | Query Cypher simple : `MATCH (f:Function) WHERE f.name = 'chatService' RETURN f` |
| `context` | Récupérer contexte `chat.service.ts` |
| `impact` | Analyser impact de modifier `chat-message.service.ts` (P04) |
| `detect_changes` | Diff entre HEAD et HEAD~5 |
| `rename` | Simulation rename `sendMessage` → `dispatchMessage` (dry-run) |
| `cypher` | Query avancée : top 10 fichiers les plus dépendants |

Documenter chaque réponse dans `team-knowledge.json` sous `gitnexus_mcp_validation`.

### 3. Valider les 7 skills gitnexus-*

Chaque skill reçoit 1 test concret :

| Skill | Test concret |
|---|---|
| `gitnexus-guide` | Lister tous les tools disponibles + ressources `gitnexus://repo/InnovMind/*` |
| `gitnexus-cli` | Run `gitnexus analyze` + interpréter status |
| `gitnexus-exploring` | Trace flow "comment un message chat arrive de l'UI au LLM" |
| `gitnexus-debugging` | Trouver pourquoi un message peut échouer le guardrail (input vs output) |
| `gitnexus-refactoring` | Simuler split de `useChatSession.ts` (P08) |
| `gitnexus-impact-analysis` | Calculer impact risk level de modifier `chat-message.service.ts` (P04) |
| `gitnexus-pr-review` | Review du PR qui mergera P01 |

Résultats consignés dans `docs/plans/reports/P03-gitnexus-skills-validation.md`.

### 4. Check AGENTS.md — état réel

Ouvrir `/AGENTS.md` et vérifier :
- Les 6 MCP tools listés correspondent à ce qui tourne
- Les 7 skills gitnexus-* référencés sont tous actifs (ToolSearch → présents dans la liste system)
- Les "Impact Risk Levels" (d=1/2/3) sont utilisés dans les skills impact-analysis
- La section "Self-check" est appliquée (post-commit hook vivant)
- La "CLI reference" est à jour (commands décrites = commands disponibles)

Si écart détecté → update AGENTS.md + changelog.

### 5. Documenter la nouvelle cartographie

Créer `docs/plans/reports/P03-cartography-snapshot-2026-04-17.md` avec :
- Date du snapshot
- Métriques d'index (fichiers, symboles, clusters)
- Top 10 fichiers par dépendance entrante
- Top 10 fonctions par complexité cyclomatique
- Top 10 clusters par taille
- Liste des cross-module imports (potentielle violation hexagonale)

Ce snapshot servira de baseline pour mesurer l'impact de P04, P06, P08 après refactor.

### 6. Post-commit hook — confirmer

```bash
cat .git/hooks/post-commit 2>/dev/null | grep gitnexus || echo "HOOK MISSING"
```

Si hook manque, l'installer :
```bash
echo -e '#!/bin/sh\ngitnexus analyze --incremental &\n' > .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

## Verification

```bash
# Index à jour
gitnexus status
# attendu: "up to date" ou timestamp récent

# MCP tools accessibles (via Claude Code)
# → tester via le skill gitnexus-guide

# AGENTS.md reflect la réalité
grep -c "MCP Tools" AGENTS.md
grep -c "gitnexus-" AGENTS.md

# Snapshot généré
ls docs/plans/reports/P03-*.md
```

## Fichiers Critiques

- `AGENTS.md` (racine — vérifier et mettre à jour si écart)
- `.git/hooks/post-commit` (vérifier présence hook gitnexus)
- `docs/plans/reports/P03-cartography-snapshot-2026-04-17.md` (créer)
- `docs/plans/reports/P03-gitnexus-skills-validation.md` (créer)
- `docs/DOCS_INDEX.md` (P01 — ajouter référence au snapshot)

## Risques

- **Faible** : gitnexus analyze --full peut prendre 5-10 min sur monorepo. Non bloquant.
- **Faible** : si découverte écart AGENTS.md, update simple.

## Done When

- [ ] `gitnexus analyze` OK, index fresh
- [ ] 6 MCP tools validés avec test concret
- [ ] 7 skills gitnexus-* validés avec test concret
- [ ] `docs/plans/reports/P03-cartography-snapshot-2026-04-17.md` créé
- [ ] `docs/plans/reports/P03-gitnexus-skills-validation.md` créé
- [ ] AGENTS.md aligné avec réalité
- [ ] post-commit hook actif
- [ ] DOCS_INDEX référence les snapshots
