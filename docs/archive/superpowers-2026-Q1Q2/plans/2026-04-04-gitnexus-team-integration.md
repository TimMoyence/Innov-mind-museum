# GitNexus Deep Integration into /team + Sentinelle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate GitNexus code intelligence (impact analysis, scope validation, cluster skills) deeply into the /team SDLC orchestrator and Sentinelle agent, so every phase uses graph-based context and the index stays fresh with auto-generated cluster skills.

**Architecture:** GitNexus MCP tools become first-class citizens in the SDLC cycle. The Tech Lead uses `query`/`impact`/`context` during analysis and planning. DEV agents must run `impact` before editing symbols. The Sentinelle uses `detect_changes` and cluster boundaries at every gate to validate scope. Post-commit, `npx gitnexus analyze --skills` regenerates cluster-specific skills in `.claude/skills/generated/`.

**Tech Stack:** GitNexus MCP (16 tools), LadybugDB graph (297K nodes), Leiden community detection for clusters, `.claude/skills/generated/` for auto-generated skills.

---

### Task 1: Create GitNexus Integration Protocol

The central reference document that defines when and how each GitNexus tool is used per SDLC phase.

**Files:**
- Create: `.claude/team-protocols/gitnexus-integration.md`

- [ ] **Step 1: Create the protocol file**

```markdown
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
     Execution flows: [liste des processes pertinents]
     Clusters impactes: [liste des clusters]
     Symboles cles: [avec nombre de callers/callees]
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
npx gitnexus analyze --skills
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

`npx gitnexus analyze --skills` genere un `SKILL.md` par cluster fonctionnel detecte par l'algorithme de Leiden. Chaque skill decrit :
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
| Post-commit (Phase 6) | `npx gitnexus analyze --skills` (obligatoire) |
| Debut de session | Hook PostToolUse detecte automatiquement si stale |
| Apres merge/rebase | `npx gitnexus analyze --skills` |
| Manuellement | `npx gitnexus analyze --skills --force` (full re-index) |

### Embeddings

Si `meta.json > stats.embeddings > 0`, ajouter `--embeddings` pour preserver la recherche semantique :
```bash
npx gitnexus analyze --skills --embeddings
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
```

- [ ] **Step 2: Verify the file was created correctly**

Run: `cat .claude/team-protocols/gitnexus-integration.md | head -5`
Expected: `# GitNexus Integration — Code Intelligence Protocol`

- [ ] **Step 3: Commit**

```bash
git add .claude/team-protocols/gitnexus-integration.md
git commit -m "feat(team): add GitNexus integration protocol for SDLC phases"
```

---

### Task 2: Upgrade Sentinelle with GitNexus Powers

Add GitNexus capabilities to the existing process-auditor.md. The Sentinelle gains scope validation via graph, cluster boundary checking, and impact audit at the final gate.

**Files:**
- Modify: `.claude/agents/process-auditor.md`

- [ ] **Step 1: Add GitNexus section after SPOT-CHECK CODE section (after line 181)**

Insert this new section between `## SPOT-CHECK CODE` and `## EVALUATION ROI DES AGENTS`:

```markdown
---

## GITNEXUS — CODE INTELLIGENCE

Tu utilises les outils GitNexus MCP pour valider le scope, verifier les frontieres architecturales, et auditer l'impact des changements. GitNexus te donne une vue structurelle que `git diff` seul ne peut pas fournir.

Cf. `team-protocols/gitnexus-integration.md` pour le protocole complet.

### Scope Validation par Graph (Porte 3 — DEV)

En complement du `git diff --name-only` vs whitelist, tu executes :

1. `gitnexus_detect_changes({scope: "all"})` — mappe les lignes changees aux execution flows affectes
2. Compare les processes affectes vs les processes planifies (Phase 1)
3. Si process non planifie affecte :
   - Process mineur (d=3, pas de critical path) → **WARN** `SCOPE_DRIFT_MINOR`
   - Process critique (d=1, core infrastructure) → **FAIL** `SCOPE_DRIFT_CRITICAL`

Inclure dans chaque verdict post-DEV :
```
GitNexus Scope Check:
  Planned processes: [du plan Phase 1]
  Actually affected: [de detect_changes]
  Unexpected: [delta — vide si OK]
  Verdict: SCOPE_OK | SCOPE_DRIFT_MINOR | SCOPE_DRIFT_CRITICAL
```

### Cluster Boundary Check (Porte 3, 4)

1. `READ gitnexus://repo/InnovMind/clusters` — lister les clusters
2. Pour chaque fichier modifie, identifier son cluster d'appartenance
3. Si un agent a modifie des fichiers dans un cluster hors de son scope de mandat :
   - Meme module → **WARN** `CLUSTER_DRIFT` (peut etre justifie)
   - Module different → **FAIL** `CLUSTER_BOUNDARY_VIOLATION`

### Impact Audit (Porte Finale — SHIP)

Avant de rendre ton verdict final :

1. `gitnexus_detect_changes({scope: "staged"})` — impact des changements commites
2. Verifier que tous les processes affectes ont ete testes
3. Verifier que le risk level correspond a l'estimation Phase 1
4. Inclure dans le rapport final :
```
GitNexus Impact Audit:
  Files changed: [N]
  Processes affected: [N] (planned: [N])
  Risk level: [LOW|MEDIUM|HIGH|CRITICAL]
  Index freshness: FRESH | STALE
  Generated skills: [N] clusters
  Untested affected processes: [liste si applicable]
```

### Index Freshness Check (Porte Finale)

1. `READ gitnexus://repo/InnovMind/context` — verifier `lastCommit` vs HEAD actuel
2. Si index stale (lastCommit != HEAD) → **WARN** `INDEX_STALE` avec recommandation re-analyze
3. Reporter dans le verdict final
```

- [ ] **Step 2: Verify the edit**

Run: `grep -c "GITNEXUS" .claude/agents/process-auditor.md`
Expected: At least 4 occurrences (section title + subsection references)

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/process-auditor.md
git commit -m "feat(sentinelle): add GitNexus code intelligence — scope validation, cluster boundaries, impact audit"
```

---

### Task 3: Integrate GitNexus into SDLC Cycle Phases

Add GitNexus steps to each relevant phase in sdlc-cycle.md.

**Files:**
- Modify: `.claude/team-protocols/sdlc-cycle.md`

- [ ] **Step 1: Add GitNexus to Phase 0 — COMPRENDRE (after line 81, before `**Adaptation par mode**`)**

Insert after `7. Resumer : mode, scope, modules, fichiers, risques, recommandations, baseline`:

```markdown
8. **GitNexus Context** (obligatoire) :
   a. `gitnexus_query({query: "<scope description>"})` — trouver les execution flows pertinents
   b. Pour chaque symbole cle : `gitnexus_context({name: "<symbole>"})` — vue 360°
   c. `READ gitnexus://repo/InnovMind/clusters` — identifier les clusters impactes
   d. Inclure dans l'output :
      ```
      GitNexus Context:
        Execution flows: [liste des processes]
        Clusters impactes: [liste]
        Symboles cles: [avec callers/callees count]
      ```
```

- [ ] **Step 2: Add GitNexus to Phase 1 — PLANIFIER (after line 136, in the plan content list)**

Insert as new item 10 in the plan content:

```markdown
10. **Blast Radius (GitNexus)** — pour chaque symbole a modifier : `gitnexus_impact({target, direction: "upstream"})`.
    - d=1 (WILL BREAK) → ajouter a la whitelist agent
    - d=2 (LIKELY AFFECTED) → ajouter aux fichiers a tester
    - Si risk HIGH/CRITICAL → ajuster estimation (+0.2 correction factor)
```

- [ ] **Step 3: Add GitNexus to Phase 1.5 — CHALLENGER (after line 155, in the actions list)**

Insert as new item 6:

```markdown
6. **GitNexus Cluster Validation** — `READ gitnexus://repo/InnovMind/clusters` et verifier que le plan ne traverse pas de frontieres de cluster sans justification
```

- [ ] **Step 4: Add GitNexus to Phase 2 — DEVELOPPER (replace line 171)**

Replace:
```
1. Impact Analysis sur les fichiers du plan
```
With:
```
1. **GitNexus Impact Analysis** — pour chaque symbole a modifier : `gitnexus_impact({target, direction: "upstream"})`. Si HIGH/CRITICAL → notifier Sentinelle immediatement.
```

- [ ] **Step 5: Add GitNexus to Phase 2.5 — REGRESSION (insert before action 2)**

Insert as new action 1b:

```markdown
1b. `gitnexus_impact({target: "<symbole modifie>", direction: "upstream", depth: 3})` — identifier les dependants transitifs
```

- [ ] **Step 6: Add GitNexus to Phase 3 — VERIFIER (insert as new action 0)**

Insert before action 1:

```markdown
0. **GitNexus Scope Check** — `gitnexus_detect_changes({scope: "all"})` pour valider que les changements correspondent au scope planifie. Si process non planifie affecte → signaler a la Sentinelle.
```

- [ ] **Step 7: Add GitNexus to Phase 6 — LIVRER (insert after action 4)**

Insert as new action 5:

```markdown
5. **GitNexus Re-index** — `npx gitnexus analyze --skills` pour mettre a jour le knowledge graph et regenerer les cluster skills dans `.claude/skills/generated/`.
```

- [ ] **Step 8: Add GitNexus to Phase 7 — VALIDER (insert before action 6)**

Insert as new action 5b:

```markdown
5b. **GitNexus Index Check** — `READ gitnexus://repo/InnovMind/context` pour verifier que l'index est frais (lastCommit = HEAD). Si stale, signaler.
```

- [ ] **Step 9: Commit**

```bash
git add .claude/team-protocols/sdlc-cycle.md
git commit -m "feat(sdlc): integrate GitNexus tools at every SDLC phase — query, impact, detect_changes, analyze --skills"
```

---

### Task 4: Add GitNexus to Agent Mandate Template

Ensure all DEV agents must consult GitNexus before editing existing symbols.

**Files:**
- Modify: `.claude/team-protocols/agent-mandate.md`

- [ ] **Step 1: Add GitNexus section to the mandate template (after `### Community Skills` section, before `### Criteres de viabilite`)**

Insert this new section:

```markdown
### GitNexus — Code Intelligence (obligatoire)

AVANT de modifier un symbole existant (fonction, classe, methode), tu DOIS :

1. `gitnexus_impact({target: "<nom du symbole>", direction: "upstream"})` — verifier le blast radius
2. Si d=1 dependants > 5 : `gitnexus_context({name: "<symbole>"})` — comprendre tous les usages
3. Si risk HIGH ou CRITICAL : **STOP** — signaler au Tech Lead dans ton rapport. NE PAS modifier sans validation.
4. Pour les renames : `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` — JAMAIS de rename manuel find-and-replace

**Rappel** : `gitnexus_detect_changes` sera execute par la Sentinelle a la Porte 3. Si tu as modifie des processes non planifies, la Sentinelle le detectera et ton score baissera.
```

- [ ] **Step 2: Add GitNexus to the Intelligence d'Allocation table (after last row)**

Add new rows:

```markdown
| Refactor multi-fichier | Backend/Frontend + gitnexus_rename | Find-and-replace manuel |
| Feature impactant shared/ | Backend + gitnexus_impact obligatoire | Backend seul (blast radius inconnu) |
```

- [ ] **Step 3: Commit**

```bash
git add .claude/team-protocols/agent-mandate.md
git commit -m "feat(mandates): add GitNexus impact check obligation for all DEV agents"
```

---

### Task 5: Update Context Loading for Generated Skills

Add GitNexus generated skills to the smart context loading system.

**Files:**
- Modify: `.claude/team-protocols/context-loading.json`

- [ ] **Step 1: Add gitnexus-generated rule to community_skills.rules array**

Add this entry at the end of the `community_skills.rules` array (after the `browser-testing` rule):

```json
,
      {
        "id": "gitnexus-generated",
        "applies_to": ["feature", "feature-backend", "feature-frontend", "feature-fullstack", "bug", "refactor"],
        "condition": "Load generated cluster skills matching scope modules from .claude/skills/generated/",
        "skills_path": ".claude/skills/generated/",
        "loading": "Tech Lead identifies impacted clusters via gitnexus_query or gitnexus://repo/InnovMind/clusters, then loads matching SKILL.md files"
      },
      {
        "id": "gitnexus-core",
        "applies_to": ["feature", "feature-backend", "feature-frontend", "feature-fullstack", "bug", "refactor", "hotfix", "audit"],
        "condition": "always — code intelligence protocol",
        "skills": ["gitnexus-exploring", "gitnexus-impact-analysis", "gitnexus-debugging", "gitnexus-refactoring"]
      }
```

- [ ] **Step 2: Verify JSON is valid**

Run: `python3 -c "import json; json.load(open('.claude/team-protocols/context-loading.json'))"`
Expected: No output (valid JSON)

- [ ] **Step 3: Commit**

```bash
git add .claude/team-protocols/context-loading.json
git commit -m "feat(context-loading): add GitNexus generated cluster skills + core skills to smart loading"
```

---

### Task 6: Add detect_changes to Quality Gates Verification Pipeline

Replace the grep-based impact analysis with GitNexus graph-based analysis.

**Files:**
- Modify: `.claude/team-protocols/quality-gates.md`

- [ ] **Step 1: Replace the Impact Analysis section (lines 125-135)**

Replace the existing `## Impact Analysis` section with:

```markdown
## Impact Analysis (GitNexus)

Avant de modifier un fichier, identifier ses **dependants** via le knowledge graph :

```bash
# Graph-based (preferred — understands call chains, not just imports)
gitnexus_impact({target: "<symbole>", direction: "upstream"})

# Fallback si GitNexus indisponible
rg "from.*<module-path>" museum-backend/src/ --files-with-matches
```

**Depth mapping** :
| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers | MUST update + whitelist |
| d=2 | LIKELY AFFECTED — indirect | MUST test |
| d=3 | MAY NEED TESTING — transitive | Test si critical path |

Si fichier partage (ex: `@shared/errors/app.error.ts`) modifie → blast radius large → TEST full.

**Scope Verification** (post-DEV, executed by Sentinelle):
```bash
gitnexus_detect_changes({scope: "all"})
```
Compare processes affectes vs processes planifies. Drift = WARN ou FAIL selon criticite.
```

- [ ] **Step 2: Add GitNexus to Verification Pipeline table (after Etape 3b SAST section)**

Insert new section:

```markdown
### Etape 3c: Scope Verification (GitNexus)

Execute par la **Sentinelle** a chaque gate post-DEV :

| Check | Outil | Verdict |
|-------|-------|---------|
| Scope drift | `gitnexus_detect_changes` | SCOPE_OK / SCOPE_DRIFT |
| Cluster boundary | `gitnexus://repo/InnovMind/clusters` | OK / CLUSTER_DRIFT |
| Index freshness | `gitnexus://repo/InnovMind/context` | FRESH / STALE |

**Verdicts GitNexus** :
- Scope drift mineur (process d=3) → **WARN**
- Scope drift critique (core process non planifie) → **FAIL**
- Cluster boundary violation (agent cross-module) → **FAIL**
- Index stale → **WARN** + recommandation re-analyze
```

- [ ] **Step 3: Commit**

```bash
git add .claude/team-protocols/quality-gates.md
git commit -m "feat(quality-gates): add GitNexus scope verification + replace grep-based impact analysis"
```

---

### Task 7: Add GitNexus Re-index to FINALIZE Protocol

Add `analyze --skills` as a mandatory post-commit step.

**Files:**
- Modify: `.claude/team-protocols/finalize.md`

- [ ] **Step 1: Add Step 11 after Step 10 in the FINALIZE protocol (after line 29)**

Insert after `10. Ecrire/enrichir le rapport journalier (summary + detail)`:

```markdown
  11. GitNexus Re-index + Generated Skills
      ```bash
      npx gitnexus analyze --skills
      ```
      - Met a jour le knowledge graph avec les commits du run
      - Regenere `.claude/skills/generated/*.md` (1 skill par cluster fonctionnel)
      - Si `meta.json > stats.embeddings > 0` : ajouter `--embeddings`
      - Verifier : `cat .gitnexus/meta.json` — lastCommit doit matcher HEAD
      - Reporter dans le rapport : `GitNexus: re-indexed [N] nodes, [N] clusters, [N] generated skills`
```

- [ ] **Step 2: Add GitNexus index status to the rapport journalier format (in the Context Efficiency Protocol section)**

In the Executive Summary template, add after `### Quality Ratchet`:

```markdown
### GitNexus Index
| Metrique | Valeur |
|----------|--------|
| Nodes | [N] |
| Edges | [N] |
| Clusters | [N] |
| Processes | [N] |
| Generated Skills | [N] |
| Last Indexed | [commit hash] |
```

- [ ] **Step 3: Commit**

```bash
git add .claude/team-protocols/finalize.md
git commit -m "feat(finalize): add GitNexus re-index + generated skills as FINALIZE step 11"
```

---

### Task 8: Update Main Team Skill File

Add GitNexus references, protocol link, and compose support.

**Files:**
- Modify: `.claude/skills/team/SKILL.md`

- [ ] **Step 1: Add GitNexus protocol to the PROTOCOLES EXTERNES table (after line 40)**

Add new row:

```markdown
| `team-protocols/gitnexus-integration.md` | Code intelligence : outils, phases, clusters, generated skills, index freshness |
```

- [ ] **Step 2: Add GitNexus to SKILLS COMPLEMENTAIRES section (after ### Skills Internes list)**

Insert new subsection:

```markdown
### GitNexus — Code Intelligence
- **gitnexus-exploring** — Naviguer le code via le knowledge graph
- **gitnexus-debugging** — Tracer les bugs via les call chains
- **gitnexus-impact-analysis** — Blast radius avant modification
- **gitnexus-refactoring** — Rename/extract/split coordonnes via le graph
- **gitnexus-cli** — Index, status, clean, wiki, analyze --skills
- **gitnexus-guide** — Reference outils, ressources, schema
- **Generated cluster skills** — `.claude/skills/generated/*.md` (auto-genere par `analyze --skills`)
```

- [ ] **Step 3: Add GitNexus compose examples (in the SKILL COMPOSABILITY section examples)**

Add after last example:

```markdown
/team compose:gitnexus-impact-analysis,refactor "rename authService → authenticationService"
  → Execute impact analysis d'abord, identifie tous les callers, puis refactor coordonne

/team compose:gitnexus-exploring,feature-backend "comprendre le pipeline chat avant d'ajouter streaming"
  → Explore le knowledge graph, trace les execution flows, puis feature avec contexte
```

- [ ] **Step 4: Add GitNexus output to Contrats Input/Output table**

Add rows:

```markdown
| gitnexus-impact-analysis | `{target, direction, depth, dependants[], risk, processes[]}` |
| gitnexus-exploring | `{query, processes[], symbols[], clusters[]}` |
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/team/SKILL.md
git commit -m "feat(team): add GitNexus protocol reference, skills, compose patterns"
```

---

### Task 9: Update Stack Context with GitNexus Tools

Add GitNexus as a tool reference in the shared agent context.

**Files:**
- Modify: `.claude/agents/shared/stack-context.json`

- [ ] **Step 1: Add GitNexus section to the JSON (after the `knowledgeBase` key)**

Add new key:

```json
,
  "codeIntelligence": {
    "tool": "GitNexus",
    "version": "1.5.3",
    "indexPath": ".gitnexus/",
    "generatedSkillsPath": ".claude/skills/generated/",
    "protocol": "team-protocols/gitnexus-integration.md",
    "mcpTools": ["query", "context", "impact", "detect_changes", "rename", "cypher"],
    "reindex": "npx gitnexus analyze --skills",
    "note": "Agents DEV doivent consulter gitnexus_impact avant de modifier un symbole existant"
  }
```

- [ ] **Step 2: Verify JSON is valid**

Run: `python3 -c "import json; json.load(open('.claude/agents/shared/stack-context.json'))"`
Expected: No output (valid JSON)

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/shared/stack-context.json
git commit -m "feat(stack-context): add GitNexus code intelligence tool reference"
```

---

### Task 10: Create .gitnexusignore for Swift/Build Artifacts

Exclude Swift files and build artifacts from the index to avoid the parser warning.

**Files:**
- Create: `.gitnexusignore`

- [ ] **Step 1: Create the ignore file**

```
# iOS build artifacts (Expo/React Native)
ios/
*.swift

# Android build artifacts
android/

# Node modules (already excluded by default, but explicit)
node_modules/

# Build outputs
museum-backend/dist/
museum-frontend/.test-dist/
museum-web/.next/

# Large binary files
.gitnexus/lbug
```

- [ ] **Step 2: Commit**

```bash
git add .gitnexusignore
git commit -m "chore: add .gitnexusignore to exclude Swift/build artifacts from GitNexus index"
```

---

### Task 11: Run Initial analyze --skills and Verify

Generate the cluster skills and verify the full integration.

**Files:**
- Create: `.claude/skills/generated/*.md` (auto-generated by GitNexus)

- [ ] **Step 1: Run analyze with skills generation**

Run: `cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && npx gitnexus analyze --skills`
Expected: Index update + skills generated in `.claude/skills/generated/`

- [ ] **Step 2: Verify generated skills exist**

Run: `ls -la .claude/skills/generated/`
Expected: Multiple `.md` files (one per cluster)

- [ ] **Step 3: Verify meta.json is updated**

Run: `cat .gitnexus/meta.json`
Expected: `lastCommit` matches current HEAD, `stats.communities` > 0

- [ ] **Step 4: Read one generated skill to verify quality**

Run: `head -30 .claude/skills/generated/*.md | head -60`
Expected: Structured skill files with cluster description, key files, entry points, execution flows

- [ ] **Step 5: Commit generated skills**

```bash
git add .claude/skills/generated/
git commit -m "feat: add GitNexus-generated cluster skills for code intelligence"
```

---

### Task 12: Final Verification — End-to-End Check

Verify all integration points are consistent and cross-referenced.

- [ ] **Step 1: Verify all files reference the protocol**

Run: `grep -rl "gitnexus-integration.md" .claude/`
Expected: At least `skills/team/SKILL.md` and `agents/process-auditor.md`

- [ ] **Step 2: Verify context-loading.json is valid and has GitNexus rules**

Run: `python3 -c "import json; d=json.load(open('.claude/team-protocols/context-loading.json')); rules=[r['id'] for r in d['community_skills']['rules']]; print([r for r in rules if 'gitnexus' in r])"`
Expected: `['gitnexus-generated', 'gitnexus-core']`

- [ ] **Step 3: Verify Sentinelle has GitNexus section**

Run: `grep "GITNEXUS" .claude/agents/process-auditor.md`
Expected: Section header visible

- [ ] **Step 4: Verify SDLC cycle references GitNexus at key phases**

Run: `grep -c "gitnexus\|GitNexus" .claude/team-protocols/sdlc-cycle.md`
Expected: 10+ occurrences across phases

- [ ] **Step 5: Verify generated skills are loadable**

Run: `ls .claude/skills/generated/*.md 2>/dev/null | wc -l`
Expected: > 0 files

- [ ] **Step 6: Final commit if any loose changes**

```bash
git status
# If changes: git add + commit
```
