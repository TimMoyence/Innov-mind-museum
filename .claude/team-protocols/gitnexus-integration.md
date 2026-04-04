# GitNexus Integration — Code Intelligence Protocol

## Overview

GitNexus fournit une intelligence structurelle du codebase via un knowledge graph (297K+ nodes, 500K+ relationships). Ce protocole definit comment chaque phase SDLC et la Sentinelle utilisent les outils GitNexus.

## Outils Disponibles (via MCP)

| Outil | Usage SDLC | Phase |
|-------|-----------|-------|
| `gitnexus_query({query})` | Decouvrir les execution flows lies au scope | Phase 0 COMPRENDRE |
| `gitnexus_context({name})` | Vue 360° d'un symbole (callers, callees, processes) | Phase 0, 1, 2 |
| `gitnexus_impact({target, direction})` | Blast radius avant modification | Phase 1, 2, 2.5 |
| `gitnexus_detect_changes({scope})` | Mapper les changements aux processes affectes | Phase 3, 6, Sentinelle |
| `gitnexus_rename({symbol_name, new_name, dry_run})` | Rename multi-fichier coordonne | Phase 2 (refactor) |
| `gitnexus_cypher({query})` | Requetes graph custom | Debug, audit |

## Ressources MCP

| Ressource | Usage |
|-----------|-------|
| `gitnexus://repo/InnovMind/context` | Stats codebase, fraicheur index |
| `gitnexus://repo/InnovMind/clusters` | Zones fonctionnelles (Leiden communities) |
| `gitnexus://repo/InnovMind/processes` | Tous les execution flows |
| `gitnexus://repo/InnovMind/process/{name}` | Trace step-by-step d'un flow |

## Usage par Phase

### Phase 0 — COMPRENDRE

Le Tech Lead utilise GitNexus pour enrichir l'analyse au-dela de la simple lecture de fichiers :

1. `gitnexus_query({query: "<description du scope>"})` — trouver les execution flows pertinents
2. Pour chaque symbole cle identifie : `gitnexus_context({name: "<symbole>"})` — callers, callees, process participation
3. `READ gitnexus://repo/InnovMind/clusters` — identifier les clusters fonctionnels impactes
4. Inclure dans l'output d'analyse :
   ```
   GitNexus Context:
     Execution flows: [liste des processes]
     Clusters impactes: [liste]
     Symboles cles: [avec callers/callees count]
   ```

### Phase 1 — PLANIFIER

Le Tech Lead utilise le blast radius pour informer l'estimation et la whitelist :

1. Pour chaque fichier/symbole a modifier : `gitnexus_impact({target: "<symbole>", direction: "upstream"})`
2. **Depth mapping** :
   - d=1 (WILL BREAK) → fichiers a ajouter a la whitelist agent
   - d=2 (LIKELY AFFECTED) → fichiers a tester
   - d=3 (MAY NEED TESTING) → noter pour regression
3. Si impact HIGH/CRITICAL → ajuster estimation (facteur supplementaire +0.2)
4. Inclure dans le plan :
   ```
   Blast Radius (GitNexus):
     d=1 (MUST UPDATE): [fichiers]
     d=2 (MUST TEST): [fichiers]
     Risk: [LOW|MEDIUM|HIGH|CRITICAL]
   ```

### Phase 1.5 — CHALLENGER

Validation des frontieres architecturales :

1. `READ gitnexus://repo/InnovMind/clusters` — lister les clusters
2. Pour chaque fichier du plan, verifier qu'il appartient aux clusters attendus
3. Si le plan traverse des frontieres de cluster sans justification → flag pour review
4. Verifier que les execution flows impactes sont coherents avec le scope declare

### Phase 2 — DEVELOPPER

**Obligation pour les agents DEV** (injecte dans le mandat) :

1. AVANT de modifier un symbole existant → `gitnexus_impact({target: "<symbole>", direction: "upstream"})`
2. Si impact HIGH/CRITICAL → STOP, signaler au Tech Lead via rapport
3. AVANT de modifier un fichier avec 5+ callers → `gitnexus_context({name: "<symbole>"})` pour comprendre tous les usages
4. Pour les refactors : utiliser `gitnexus_rename({..., dry_run: true})` avant tout rename manuel

### Phase 2.5 — REGRESSION

Utiliser les dependants transitifs pour identifier les tests manquants :

1. `gitnexus_impact({target: "<symbole modifie>", direction: "upstream", depth: 3})`
2. Pour chaque dependant d=2/d=3 : verifier qu'un test existe
3. Si test manquant pour un dependant d=2 → generer via /test-writer

### Phase 3 — VERIFIER (Sentinelle)

La Sentinelle utilise `detect_changes` pour valider le scope :

1. `gitnexus_detect_changes({scope: "all"})` — mapper les changements aux processes
2. Comparer les processes affectes vs les processes planifies (Phase 1)
3. Si process non planifie affecte → **WARN** (si mineur) ou **FAIL** (si critique)
4. Inclure dans le verdict :
   ```
   GitNexus Scope Check:
     Planned processes: [liste]
     Actually affected: [liste]
     Unexpected: [liste si applicable]
     Verdict: SCOPE_OK | SCOPE_DRIFT [detail]
   ```

### Phase 6 — LIVRER

Apres chaque commit, re-indexer avec generation de skills :

```bash
gitnexus analyze --skills
```

Cela :
1. Met a jour le knowledge graph avec les nouveaux commits
2. Re-detecte les communities (Leiden)
3. Genere/met a jour `.claude/skills/generated/*.md` (1 skill par cluster)

### Phase 7 — VALIDER (Sentinelle)

Verification de fraicheur :

1. `READ gitnexus://repo/InnovMind/context` — verifier que `lastCommit` correspond au HEAD
2. Si stale → signaler dans le rapport final
3. Inclure dans le rapport :
   ```
   GitNexus Index: FRESH | STALE (last indexed: [commit])
   Clusters: [N] | Processes: [N] | Generated Skills: [N]
   ```

---

## Generated Skills (Cluster Skills)

### Qu'est-ce que c'est

`gitnexus analyze --skills` genere un `SKILL.md` par cluster fonctionnel detecte par l'algorithme de Leiden. Chaque skill decrit :
- Les fichiers cles du cluster
- Les entry points
- Les execution flows internes
- Les connexions avec d'autres clusters

### Emplacement

`.claude/skills/generated/` — regenere a chaque `analyze --skills`.

### Chargement contextuel

Le Tech Lead charge les generated skills pertinentes au scope du run :
1. Identifier les clusters impactes via `gitnexus_query` ou `gitnexus://repo/InnovMind/clusters`
2. Charger les skills correspondantes depuis `.claude/skills/generated/`
3. Injecter dans les mandats agents si pertinent

### Fraicheur

Les skills sont regenerees a chaque `analyze --skills` (Phase 6 LIVRER). Elles sont donc toujours a jour apres un commit.

---

## Index Freshness

### Quand re-indexer

| Evenement | Action |
|-----------|--------|
| Post-commit (Phase 6) | `gitnexus analyze --skills` (obligatoire) |
| Debut de session | Hook PostToolUse detecte automatiquement si stale |
| Apres merge/rebase | `gitnexus analyze --skills` |
| Manuellement | `gitnexus analyze --skills --force` (full re-index) |

### Embeddings

Si `meta.json > stats.embeddings > 0`, ajouter `--embeddings` pour preserver la recherche semantique :
```bash
gitnexus analyze --skills --embeddings
```

Actuellement embeddings = 0, donc `--skills` suffit.

---

## Risk Levels (Reference)

| Depth | Meaning | Action SDLC |
|-------|---------|-------------|
| d=1 | WILL BREAK — direct callers/importers | MUST update + whitelist agent |
| d=2 | LIKELY AFFECTED — indirect deps | MUST test |
| d=3 | MAY NEED TESTING — transitive | Test si critical path |

| Risk | Meaning | Action SDLC |
|------|---------|-------------|
| LOW | < 5 dependants, module isole | Estimation standard |
| MEDIUM | 5-15 dependants, cross-module | +10% buffer |
| HIGH | 15+ dependants, shared utility | +20% buffer, review Sentinelle |
| CRITICAL | Core infrastructure, 50+ dependants | +40% buffer, user validation |
