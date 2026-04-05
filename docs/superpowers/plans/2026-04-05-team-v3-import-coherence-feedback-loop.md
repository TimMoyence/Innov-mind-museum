# /team v3 — Import Coherence + Feedback Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the /team skill to v3 with two priorities: (B) eliminate import breakage between parallel agents via a shift-left coherence protocol, and (C) activate the feedback loop (PE scoring, agent ROI, error patterns) using battle-tested patterns from Zenfirst.

**Architecture:** The 409L monolithic SKILL.md becomes a ~130L pure dispatcher. Business rules, gates, anti-patterns move to modular protocol files loaded conditionally via 3 pipeline tiers (micro/standard/enterprise). A new `import-coherence.md` protocol enforces pre-edit GitNexus impact analysis and post-agent scoped tsc checks. The 7 empty KB JSON files get activated with scoring schemas from Zenfirst's 17-run production system.

**Tech Stack:** Claude Code skills (Markdown), JSON knowledge base files, GitNexus MCP tools, Bash (tsc scoped checks)

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `team-protocols/sdlc-pipelines.md` | 3 pipeline tiers (micro/standard/enterprise) + mode→pipeline matrix + auto-escalation rules |
| `team-protocols/import-coherence.md` | Pre-edit GitNexus enforcement, post-agent scoped tsc, delete/rename protocol |
| `team-protocols/finalize.md` | KB update procedures, PE scoring, agent ROI, auto-apply stale amendments |
| `team-protocols/gitnexus-integration.md` | Per-phase GitNexus tool usage — enforced, not aspirational |
| `team-protocols/error-taxonomy.md` | Error classification, response matrix, corrective loop rules |
| `team-protocols/conflict-resolution.md` | Evidence → cross-validation → synthesis → escalation |
| `team-templates/micro.md` | Lightweight template: ≤5 files, 3 phases, no Sentinelle |
| `team-templates/standard.md` | Mid-weight template: 6-20 files, 7 phases, lightweight Sentinelle |
| `team-templates/enterprise.md` | Full-weight template: 20+ files, 10 phases, full Sentinelle |

### Modified files
| File | Changes |
|------|---------|
| `SKILL.md` | Rewrite from 409L to ~130L pure dispatcher (zero business rules) |
| `team-protocols/agent-mandate.md` | Add import-coherence shift-left section, absorb anti-patterns from SKILL.md |
| `team-protocols/quality-gates.md` | Add inter-agent scoped tsc step, lean gates (skip redundant checks) |
| `team-knowledge/error-patterns.json` | Activate with proper schema (type, agent, phase, score, occurrences) |
| `team-knowledge/prompt-enrichments.json` | Activate with PE scoring schema (0-5, auto-reformulate) |
| `team-knowledge/agent-performance.json` | Activate with ROI tracking schema (specializations, weakness, retirement) |
| `team-knowledge/velocity-metrics.json` | Activate with run tracking schema |
| `team-knowledge/next-run.json` | Activate with recommendations + auto-apply staleness tracking |
| `team-knowledge/autonomy-state.json` | Activate with level tracking + hard-reset rules |
| `team-knowledge/estimation-accuracy.json` | Activate with estimation vs actual tracking |

### Unchanged files
| File | Reason |
|------|--------|
| `.claude/agents/*.md` (9 agents) | Agent definitions stay as-is — they already reference shared constraints |
| `.claude/agents/shared/*.json` (3 files) | Operational constraints, discovery protocol, stack context — unchanged |
| `team-templates/audit.md` | Already complete and working |
| `team-knowledge/quality-ratchet.json` | Already active with real data |

---

## Task 1: New protocol — `import-coherence.md` (Priority B core)

**Files:**
- Create: `.claude/skills/team/team-protocols/import-coherence.md`

This is the most critical new file — it directly addresses the import breakage problem.

- [ ] **Step 1: Create the import coherence protocol**

```markdown
# Import Coherence — Protocole anti-imports casses

Protocole de coherence des imports entre agents paralleles.
Charge en mode **standard** et **enterprise** (pas micro — single-scope, risque faible).

---

## NIVEAU 1 — Pre-edit (dans le mandat agent)

**OBLIGATOIRE avant de modifier, supprimer ou renommer un symbole ou fichier.**

### Modification d'un symbole existant

```
1. gitnexus_impact({target: "<symbolName>", direction: "upstream"})
2. Lire la liste des dependants d=1 (WILL BREAK)
3. Si dependants d=1 > 0 ET dans ton scope autorise → les inclure dans tes modifications
4. Si dependants d=1 > 0 ET hors de ton scope → FLAG comme Discovery :
   ### Discoveries (hors scope)
   - IMPACT: `<symbolName>` a N dependants hors scope: [liste fichiers]
   - ACTION REQUISE: Tech Lead doit coordonner la mise a jour
5. Ne PAS proceder a la modification sans avoir traite tous les d=1
```

### Suppression d'un fichier

```
1. gitnexus_context({name: "<fileName>"}) → lister TOUS les importers
2. Pour chaque importer dans ton scope :
   a. Ouvrir le fichier
   b. Supprimer ou remplacer l'import
   c. Verifier que le fichier compile sans l'import supprime
3. Pour chaque importer hors scope → FLAG comme Discovery
4. Supprimer le fichier SEULEMENT apres avoir traite tous les importers de ton scope
5. Si des importers hors scope existent → NE PAS supprimer, FLAG et attendre coordination
```

### Rename d'un symbole

```
1. gitnexus_rename({symbol_name: "<old>", new_name: "<new>", dry_run: true})
2. Lire le preview :
   - graph_edits: safe (le knowledge graph connait les references)
   - text_search_edits: a verifier manuellement (grep-based, peut avoir des faux positifs)
3. Si tous les fichiers touches sont dans ton scope → gitnexus_rename({dry_run: false})
4. Si des fichiers touches sont hors scope → FLAG comme Discovery, NE PAS renommer
```

### Creation d'un nouveau fichier

```
1. Verifier que le chemin respecte l'architecture (cf. agent definition)
2. Si le fichier exporte des symboles importes par d'autres (ex: types partages) :
   a. Verifier que les importers potentiels utilisent le bon chemin
   b. Utiliser les path aliases (@src/, @/, @modules/) — jamais de chemins relatifs profonds (../../..)
3. Si le fichier cree un nouveau barrel (index.ts) → verifier qu'il est importe correctement
```

---

## NIVEAU 2 — Post-agent scoped tsc (entre agents paralleles)

**Execute par le Tech Lead apres qu'un agent DEV termine, AVANT de merger ou lancer le gate.**

```bash
# 1. Lister les fichiers modifies par l'agent
CHANGED=$(git diff --name-only HEAD)

# 2. Pour chaque fichier modifie, trouver les dependants d=1 via GitNexus
# gitnexus_impact({target: "<file>", direction: "upstream"}) pour chaque fichier

# 3. Scoped tsc — backend
cd museum-backend && npx tsc --noEmit 2>&1 | head -20

# 4. Scoped tsc — frontend (si fichiers frontend modifies)
cd museum-frontend && npx tsc --noEmit 2>&1 | head -20
```

**Decision tree :**

| Resultat tsc | Action |
|-------------|--------|
| 0 erreurs | PASS — merger, continuer |
| Erreurs dans fichiers modifies par l'agent | Renvoyer au MEME agent avec le message d'erreur exact |
| Erreurs dans fichiers NON modifies (effet cascade) | Tech Lead corrige ou spawne un agent de correction cible |

**Regle : max 2 retours au meme agent.** Au 3e echec → escalade utilisateur.

---

## NIVEAU 3 — Verification pre-gate (renforce quality-gates.md)

Avant d'envoyer le rapport de porte a la Sentinelle :

```
1. gitnexus_detect_changes({scope: "staged"})
2. Comparer les fichiers changes avec le scope attendu du template
3. Si fichiers inattendus → WARN (pas FAIL, mais signale)
4. tsc global (backend + frontend) — dernier filet de securite
5. Si tsc global FAIL apres que les scoped tsc individuels ont PASS → 
   c'est un conflit inter-agents, le Tech Lead doit resoudre manuellement
```

---

## INJECTION DANS LES MANDATS

Chaque mandat DEV (backend-architect, frontend-architect) DOIT inclure cette section :

```
### COHERENCE IMPORTS (OBLIGATOIRE)

AVANT de modifier/supprimer/renommer un symbole ou fichier :
1. Run gitnexus_impact({target: "symbolName", direction: "upstream"})
2. Traiter TOUS les dependants d=1 dans ton scope
3. FLAG comme Discovery les dependants hors scope
4. NE JAMAIS supprimer un fichier sans traiter ses importers

AVANT de creer un nouveau fichier :
1. Utiliser les path aliases (@src/, @/, @modules/) pour les imports
2. Verifier que le barrel index.ts parent est mis a jour si necessaire

Si tu ne respectes pas ce protocole → FAIL de porte automatique.
```

---

## METRIQUES

A chaque run, tracker dans error-patterns.json :
- Nombre de FAIL tsc post-agent (avant correction)
- Nombre de Discoveries import hors scope
- Nombre de corrections inter-agents (cascade)
- Tendance : si les FAIL tsc post-agent diminuent de run en run, le protocole fonctionne
```

- [ ] **Step 2: Verify the file was created correctly**

```bash
wc -l .claude/skills/team/team-protocols/import-coherence.md
```
Expected: ~120 lines

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/team/team-protocols/import-coherence.md
git commit -m "feat(team): add import-coherence protocol — shift-left GitNexus enforcement + post-agent scoped tsc"
```

---

## Task 2: New protocol — `sdlc-pipelines.md` (Pipeline tiers)

**Files:**
- Create: `.claude/skills/team/team-protocols/sdlc-pipelines.md`

- [ ] **Step 1: Create the pipeline tiers protocol**

```markdown
# SDLC Pipelines — 3 Tiers

Definit les 3 pipelines d'execution et la matrice de routing mode → pipeline.

---

## CLASSIFICATION AUTOMATIQUE

```
micro:      ≤5 fichiers ET ≤200 lignes ET single-scope (backend-only OU frontend-only)
standard:   6-20 fichiers OU multi-scope OU modification d'interface publique OU mode refactor
enterprise: 20+ fichiers OU cross-module OU migration DB OU security-sensitive OU mode audit
```

**Auto-escalade :**
- Si un agent micro depasse 5 fichiers → escalade automatique en standard
- Si un standard depasse 20 fichiers → escalade en enterprise
- L'escalade est loguee dans velocity-metrics.json : `{"escalation": {"from": "micro", "to": "standard", "reason": "files > 5"}}`
- L'escalade NE PEUT PAS descendre (pas de de-escalade en cours de run)

## MATRICE MODE → PIPELINE

| Mode | Pipeline par defaut | Peut descendre ? | Conditions de descente |
|------|-------------------|------------------|------------------------|
| `bug` (evident, ≤3 fichiers) | micro | Non | — |
| `bug` (complexe, multi-fichiers) | standard | Non | — |
| `chore` | micro | Non | — |
| `hotfix` | micro | Non | — |
| `mockup` | micro | Non | — |
| `feature` (ciblee, single-scope) | standard | Oui → micro | ≤5 fichiers ET ≤200 lignes |
| `feature` (fullstack) | enterprise | Oui → standard | ≤20 fichiers ET pas de migration |
| `refactor` | standard | Oui → micro | ≤5 fichiers |
| `audit` | enterprise | Non | — |

---

## PIPELINE MICRO

**Contexte charge :** SKILL.md + micro.md + quality-ratchet.json + error-patterns.json (unfixed only)
**Estimation :** ~250 lignes de contexte

### Phases

| # | Phase | Description | Gate |
|---|-------|-------------|------|
| 1 | COMPRENDRE | Lire le code concerne, comprendre le probleme | — |
| 2 | DEVELOPPER | Coder la solution (1 agent, pas de parallele) | tsc + tests |
| 3 | LIVRER | Verification finale, commit | Quality Ratchet |

### Regles micro
- **0 Sentinelle** — le Tech Lead fait les verifications lui-meme
- **1 seul agent DEV** — pas de parallelisme, pas de coordination
- **Pas de phase CHALLENGER** — scope trop petit pour justifier une review architecturale
- **Pas de phase PLAN avec validation utilisateur** — execution directe
- **Gate = tsc + tests + ratchet** — minimal mais non-negociable
- **Si auto-escalade → passer en standard** (recharger les protocoles manquants)

---

## PIPELINE STANDARD

**Contexte charge :** SKILL.md + standard.md + quality-gates.md + agent-mandate.md + import-coherence.md + quality-ratchet.json + error-patterns.json + prompt-enrichments.json
**Estimation :** ~600 lignes de contexte

### Phases

| # | Phase | Description | Gate |
|---|-------|-------------|------|
| 0 | COMPRENDRE | Analyse du probleme, lecture du code, GitNexus query | — |
| 1 | PLANIFIER | Plan technique, fichiers a modifier, estimation | — |
| 1.5 | CHALLENGER | Review architecturale (skill /challenger si disponible) | — |
| 2 | DEVELOPPER | Agents DEV en parallele si multi-scope | Post-agent scoped tsc |
| 3 | VERIFIER | tsc global + tests + ratchet + scope check | Sentinelle legere |
| 4 | TESTER | Tests supplementaires si coverage gap | — |
| 5 | LIVRER | Commit, rapport | Quality Ratchet |

### Regles standard
- **Sentinelle legere** — 1 seul checkpoint (Phase 3), pas de portes intermediaires
- **Agents DEV paralleles** si multi-scope (backend + frontend)
- **Import coherence active** — pre-edit GitNexus + post-agent scoped tsc
- **Phase CHALLENGER** — via skill dedie si disponible, sinon inline max 10 fichiers
- **Phase PLAN** — notification utilisateur (pas approbation bloquante sauf L1)

---

## PIPELINE ENTERPRISE

**Contexte charge :** SKILL.md + enterprise.md + tous les protocoles + tous les KB JSON
**Estimation :** ~1200 lignes de contexte

### Phases

| # | Phase | Description | Gate |
|---|-------|-------------|------|
| 0 | COMPRENDRE | Analyse profonde, GitNexus query + context, derniers rapports | — |
| 1 | CONCEVOIR | Design technique, architecture, interfaces | Sentinelle |
| 1.5 | CHALLENGER | Review architecturale approfondie | Sentinelle |
| 2 | PLANIFIER | Plan detaille, task graph, estimations | Validation utilisateur |
| 3 | DEVELOPPER | Agents DEV en parallele reel (run_in_background) | Post-agent scoped tsc |
| 3.5 | REGRESSION | Verification des chemins existants non casses | — |
| 4 | VERIFIER | tsc global + tests + ratchet + scope + eslint-disable scan | Sentinelle |
| 5 | TESTER | Tests supplementaires, smoke tests API si routes modifiees | Sentinelle |
| 5.5 | VIABILITE | Checklist produit (donnees persistees, offline, UX coherente) | — |
| 6 | CLEANUP | Dead code, imports inutiles, console.log | — |
| 7 | LIVRER | Commit, rapport, sprint tracking update | Sentinelle finale |

### Regles enterprise
- **Sentinelle complete** — 4 portes (CONCEVOIR, VERIFIER, TESTER, LIVRER)
- **Validation utilisateur** apres PLANIFIER (bloquant)
- **Import coherence complete** — 3 niveaux
- **Boucles correctives** — max 3, puis escalade
- **KB update** — mandatory at FINALIZE (error-patterns, PE scoring, agent ROI)
- **Sprint tracking** — update PROGRESS_TRACKER + SPRINT_LOG

---

## SMART CONTEXT LOADING

Le dispatcher SKILL.md charge les fichiers selon le pipeline :

```
MICRO:
  read team-knowledge/quality-ratchet.json
  read team-knowledge/error-patterns.json (filtre: unfixed only)
  read team-templates/micro.md

STANDARD:
  read team-knowledge/quality-ratchet.json
  read team-knowledge/error-patterns.json (filtre: unfixed only)
  read team-knowledge/prompt-enrichments.json (filtre: inject_when match mode)
  read team-protocols/quality-gates.md
  read team-protocols/agent-mandate.md
  read team-protocols/import-coherence.md
  read team-templates/standard.md

ENTERPRISE:
  read team-knowledge/*.json (7 fichiers)
  read team-protocols/*.md (8 fichiers)
  read team-templates/enterprise.md
```
```

- [ ] **Step 2: Verify line count**

```bash
wc -l .claude/skills/team/team-protocols/sdlc-pipelines.md
```
Expected: ~150 lines

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/team/team-protocols/sdlc-pipelines.md
git commit -m "feat(team): add sdlc-pipelines protocol — micro/standard/enterprise tiers with auto-escalation"
```

---

## Task 3: New templates — `micro.md`, `standard.md`, `enterprise.md`

**Files:**
- Create: `.claude/skills/team/team-templates/micro.md`
- Create: `.claude/skills/team/team-templates/standard.md`
- Create: `.claude/skills/team/team-templates/enterprise.md`

- [ ] **Step 1: Create micro.md**

```markdown
# Template: Micro

Pipeline leger pour les taches simples (bug evident, chore, hotfix, mockup).

**Criteres :** ≤5 fichiers, ≤200 lignes, single-scope.
**Contexte :** ~250 lignes chargees.

---

## TASK GRAPH

```
T1: COMPRENDRE     (blockedBy: rien)
T2: DEVELOPPER      (blockedBy: T1)
T3: LIVRER          (blockedBy: T2)
```

## PHASES

### Phase 1 — COMPRENDRE

```
1. Lire les fichiers concernes (max 5)
2. Comprendre le probleme / la demande
3. Si le scope depasse 5 fichiers ou 200 lignes → AUTO-ESCALADE vers standard
   - Message: "Scope depasse micro (N fichiers / N lignes). Escalade vers standard."
   - Recharger: quality-gates.md + agent-mandate.md + import-coherence.md + standard.md
```

### Phase 2 — DEVELOPPER

```
1. 1 seul agent DEV (pas de parallelisme)
2. Mandat minimal: objectif + fichiers autorises + contraintes techniques
3. Pas de PE/EP injection (micro = contexte minimal)
4. L'agent code, teste mentalement, rend son travail
```

**Gate post-DEV :**
```bash
# Backend (si scope backend)
cd museum-backend && pnpm lint 2>&1 | tail -5
cd museum-backend && pnpm test 2>&1 | tail -5

# Frontend (si scope frontend)
cd museum-frontend && npm run lint 2>&1 | tail -5
cd museum-frontend && npm test 2>&1 | tail -5
```

Si FAIL → 1 correction par le meme agent. Si 2e FAIL → escalade standard.

### Phase 3 — LIVRER

```
1. Verifier quality-ratchet.json (pas de regression)
2. git add + commit
3. Pas de rapport Sentinelle (micro)
4. Pas de sprint tracking update (chore/hotfix)
5. Si bug/feature → noter dans velocity-metrics.json: {pipeline: "micro", duration, files, escalated: false}
```

## DoD

- [ ] tsc PASS (backend et/ou frontend selon scope)
- [ ] Tests PASS (pas de regression)
- [ ] Quality Ratchet: pas de regression
- [ ] Code commite
```

- [ ] **Step 2: Create standard.md**

```markdown
# Template: Standard

Pipeline intermediaire pour les features ciblees, refactors, bugs complexes.

**Criteres :** 6-20 fichiers, ou multi-scope, ou interface publique modifiee.
**Contexte :** ~600 lignes chargees.

---

## TASK GRAPH

### Single-scope (backend-only ou frontend-only)

```
T1: COMPRENDRE      (blockedBy: rien)
T2: PLANIFIER        (blockedBy: T1)
T3: CHALLENGER       (blockedBy: T2)
T4: DEVELOPPER       (blockedBy: T3)
T5: VERIFIER         (blockedBy: T4)
T6: TESTER           (blockedBy: T5)     ← si coverage gap
T7: LIVRER           (blockedBy: T5 ou T6)
```

### Multi-scope (backend + frontend)

```
T1: COMPRENDRE       (blockedBy: rien)
T2: PLANIFIER         (blockedBy: T1)
T3: CHALLENGER        (blockedBy: T2)
T4: DEV-backend       (blockedBy: T3)
T5: DEV-frontend      (blockedBy: T3)     ← parallele avec T4
T6: VERIFIER          (blockedBy: T4, T5)
T7: TESTER            (blockedBy: T6)     ← si coverage gap
T8: LIVRER            (blockedBy: T6 ou T7)
```

## PHASES

### Phase 0 — COMPRENDRE

```
1. Lire les fichiers concernes
2. gitnexus_query({query: "<sujet>"}) → comprendre les execution flows
3. Si scope depasse 20 fichiers → AUTO-ESCALADE vers enterprise
4. Identifier: single-scope ou multi-scope
```

### Phase 1 — PLANIFIER

```
1. Lister les fichiers a modifier avec les changements prevus
2. Estimer le nombre de lignes (pour validation pipeline)
3. Notification utilisateur (pas approbation bloquante sauf autonomie L1)
```

### Phase 1.5 — CHALLENGER

```
1. Si skill /challenger disponible → deleguer (token-budgete: max 10 fichiers, verdict en 5 lignes si clean)
2. Sinon inline: verifier architecture, regression potentielle, coherence
3. Max 1 appel GitNexus (gitnexus_impact sur le symbole le plus critique)
```

### Phase 2 — DEVELOPPER

**Single-scope :**
```
1. Spawner 1 agent DEV avec mandat complet
2. Mandat inclut: section COHERENCE IMPORTS (cf. import-coherence.md)
3. Injecter PE pertinents (filtre inject_when)
4. Injecter EP unfixed pertinents
5. Post-agent: scoped tsc (cf. import-coherence.md niveau 2)
```

**Multi-scope :**
```
1. Spawner 2 agents DEV en parallele (run_in_background: true)
2. Chaque mandat inclut: section COHERENCE IMPORTS
3. Quand agent A termine → scoped tsc sur ses fichiers + dependants d=1
4. Quand agent B termine → scoped tsc sur ses fichiers + dependants d=1
5. Si conflit inter-agents (tsc FAIL sur fichiers non modifies) → Tech Lead resout
```

### Phase 3 — VERIFIER (Gate Sentinelle legere)

```
1. tsc global (backend + frontend)
2. Tests complets (pnpm test / npm test)
3. Quality Ratchet check
4. Scope check (fichiers modifies vs scope attendu)
5. gitnexus_detect_changes({scope: "staged"}) → verifier scope
6. Envoyer rapport a Sentinelle → verdict PASS/WARN/FAIL
```

### Phase 4 — TESTER (conditionnel)

```
Execute SEULEMENT si coverage gap detecte a Phase 3.
1. Identifier les chemins non couverts
2. Spawner qa-engineer pour ecrire les tests manquants
3. Re-run tests
```

### Phase 5 — LIVRER

```
1. Quality Ratchet: write-on-improve si amelioration
2. git add + commit
3. velocity-metrics.json: {pipeline: "standard", duration, files, agents, escalated}
4. error-patterns.json: enregistrer toute boucle corrective
5. Sprint tracking si applicable
```

## DoD

- [ ] tsc PASS (backend + frontend)
- [ ] Tests PASS (pas de regression, nouveaux tests si coverage gap)
- [ ] Quality Ratchet: pas de regression
- [ ] Import coherence: 0 erreur tsc post-agent
- [ ] Sentinelle: verdict PASS
- [ ] Code commite
- [ ] velocity-metrics mis a jour
```

- [ ] **Step 3: Create enterprise.md**

```markdown
# Template: Enterprise

Pipeline complet pour les features fullstack, migrations, refactors majeurs, audits.

**Criteres :** 20+ fichiers, cross-module, migration DB, security-sensitive.
**Contexte :** ~1200 lignes chargees (tous protocoles + tous KB).

---

## TASK GRAPH (feature-fullstack)

```
T1: COMPRENDRE       (blockedBy: rien)
T2: CONCEVOIR         (blockedBy: T1)
T3: CHALLENGER        (blockedBy: T2)
T4: PLANIFIER         (blockedBy: T3)      ← validation utilisateur
T5: DEV-backend       (blockedBy: T4)
T6: DEV-frontend      (blockedBy: T4)      ← parallele avec T5
T7: DEV-api           (blockedBy: T4)      ← parallele avec T5, T6
T8: REGRESSION        (blockedBy: T5, T6, T7)
T9: VERIFIER          (blockedBy: T8)
T10: TESTER           (blockedBy: T9)
T11: VIABILITE        (blockedBy: T10)
T12: CLEANUP          (blockedBy: T11)
T13: LIVRER           (blockedBy: T12)
```

## PHASES

### Phase 0 — COMPRENDRE

```
1. Lire les fichiers concernes
2. gitnexus_query({query: "<sujet>"}) → execution flows
3. gitnexus_context({name: "<symboles cles>"}) → 360-degree view
4. Lire le dernier rapport team-reports/ pour contexte
5. Lire next-run.json pour recommendations actives
```

### Phase 1 — CONCEVOIR

```
1. Design technique: architecture, interfaces, data flow
2. gitnexus_impact sur les symboles cles → blast radius
3. Si risk HIGH/CRITICAL → WARN utilisateur avant de continuer
4. Produire: liste des fichiers, interfaces entre agents, schema de donnees si migration

Gate Sentinelle: design coherent, blast radius accepte
```

### Phase 1.5 — CHALLENGER

```
1. Review architecturale approfondie (skill /challenger ou inline)
2. Verifier: pas de regression, coherence avec l'existant, edge cases
3. GitNexus: impact analysis sur les 3 symboles les plus critiques

Gate Sentinelle: pas de blocage architectural
```

### Phase 2 — PLANIFIER

```
1. Plan detaille avec task graph
2. Estimation par agent (fichiers, lignes, complexite)
3. Allocation dynamique: consulter agent-performance.json > specializations
   - avgScore > 9.0 → privilegier
   - avgScore < 7.0 (3+ runs) → eviter
4. VALIDATION UTILISATEUR BLOQUANTE (sauf hotfix, autonomie L3+)
```

### Phase 3 — DEVELOPPER (parallele reel)

```
1. Construire les mandats (cf. agent-mandate.md):
   - Section COHERENCE IMPORTS obligatoire
   - PE pertinents injectes (filtre inject_when)
   - EP unfixed injectes
   - Track Record agent injecte (weaknessHistory)
2. Spawner agents DEV en PARALLELE REEL:
   Agent(subagent_type: "backend-architect", team_name, run_in_background: true)
   Agent(subagent_type: "frontend-architect", team_name, run_in_background: true)
3. Quand chaque agent termine:
   a. Scoped tsc sur fichiers modifies + dependants d=1
   b. Si FAIL → renvoi au meme agent avec erreur exacte (max 2 retours)
   c. Si PASS → marquer comme complete
4. Quand tous les agents PASS → continuer
```

### Phase 3.5 — REGRESSION

```
1. Verifier que les chemins existants non modifies fonctionnent
2. Tests existants: doivent tous passer (0 regression)
3. Si regression detectee → identifier la cause, spawner agent de correction
```

### Phase 4 — VERIFIER (Gate Sentinelle)

```
1. tsc global (backend + frontend)
2. Tests complets
3. Quality Ratchet check
4. ESLint-disable scan (cf. quality-gates.md)
5. Scope check
6. gitnexus_detect_changes({scope: "staged"})

Gate Sentinelle: rapport structure, verdict PASS/WARN/FAIL
```

### Phase 5 — TESTER

```
1. Tests supplementaires si coverage gap
2. Smoke tests API si routes modifiees (1 happy + 1 auth + 1 validation par route)
3. Tests de non-regression specifiques

Gate Sentinelle: coverage non regresse, smoke tests OK
```

### Phase 5.5 — VIABILITE

```
Checklist produit (chaque agent DEV doit avoir verifie, mais le Tech Lead re-verifie):
- [ ] Donnees persistees (DB, pas juste state local)
- [ ] Edge cases (timeout, offline, permission refusee, payload invalide)
- [ ] UX coherente pour un utilisateur reel
- [ ] Retrocompatibilite API preservee (pas de breaking change)
- [ ] Migration reversible si applicable
```

### Phase 6 — CLEANUP

```
1. Supprimer dead code cree pendant le dev
2. Supprimer imports inutiles
3. Supprimer console.log de debug
4. Verifier nommage coherent
```

### Phase 7 — LIVRER (Gate Sentinelle finale)

```
1. tsc final (dernier filet)
2. Tests final
3. Quality Ratchet: write-on-improve
4. git add + commit
5. FINALIZE protocol (cf. finalize.md):
   a. Update error-patterns.json (toute boucle corrective = 1 entry)
   b. Update prompt-enrichments.json (scoring PE utilises ce run)
   c. Update agent-performance.json (score par agent, specializations)
   d. Update velocity-metrics.json (run metrics)
   e. Update next-run.json (recommendations pour le prochain run)
   f. Update autonomy-state.json (promotion/demotion si applicable)
6. Ecrire team-reports/YYYY-MM-DD.md (Executive Summary)
7. Update docs/V1_Sprint/ (PROGRESS_TRACKER + SPRINT_LOG)

Gate Sentinelle finale: DoD machine-verified (7 checks programmatiques)
```

## DoD

- [ ] tsc PASS (backend + frontend)
- [ ] Tests PASS (pas de regression + nouveaux tests)
- [ ] Quality Ratchet: pas de regression
- [ ] Import coherence: 0 erreur tsc post-agent
- [ ] Sentinelle: 4 verdicts PASS (CONCEVOIR, VERIFIER, TESTER, LIVRER)
- [ ] Viabilite: checklist produit validee
- [ ] KB: 7 fichiers JSON mis a jour
- [ ] Rapport: team-reports/ ecrit
- [ ] Sprint tracking: mis a jour
- [ ] Code commite
```

- [ ] **Step 4: Verify all 3 templates created**

```bash
wc -l .claude/skills/team/team-templates/micro.md .claude/skills/team/team-templates/standard.md .claude/skills/team/team-templates/enterprise.md
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/team/team-templates/micro.md .claude/skills/team/team-templates/standard.md .claude/skills/team/team-templates/enterprise.md
git commit -m "feat(team): add micro/standard/enterprise templates with auto-escalation and import coherence"
```

---

## Task 4: Activate KB JSON files (Priority C core)

**Files:**
- Modify: `.claude/skills/team/team-knowledge/error-patterns.json`
- Modify: `.claude/skills/team/team-knowledge/prompt-enrichments.json`
- Modify: `.claude/skills/team/team-knowledge/agent-performance.json`
- Modify: `.claude/skills/team/team-knowledge/velocity-metrics.json`
- Modify: `.claude/skills/team/team-knowledge/next-run.json`
- Modify: `.claude/skills/team/team-knowledge/autonomy-state.json`
- Modify: `.claude/skills/team/team-knowledge/estimation-accuracy.json`

- [ ] **Step 1: Activate error-patterns.json with proper schema**

Replace the empty schema with:

```json
{
  "patterns": [],
  "lastUpdated": null,
  "stats": {
    "totalRecorded": 0,
    "totalFixed": 0,
    "totalUnfixed": 0
  },
  "_schema": {
    "pattern": {
      "id": "EP-NNN",
      "type": "import-broken|type-mismatch|missing-export|scope-overflow|test-regression|lint-violation|runtime-error",
      "description": "string — what happened",
      "agent": "string — which agent caused it",
      "phase": "string — which phase it occurred in",
      "fix": "string — how it was fixed or mitigated",
      "occurrences": "number — how many times this pattern recurred",
      "status": "unfixed|fixed|mitigated",
      "firstSeen": "YYYY-MM-DD",
      "lastSeen": "YYYY-MM-DD"
    },
    "_note": "Agents read unfixed patterns at spawn to avoid repeating. Tech Lead records after each corrective loop."
  }
}
```

- [ ] **Step 2: Activate prompt-enrichments.json with PE scoring**

```json
{
  "enrichments": [],
  "lastUpdated": null,
  "stats": {
    "totalActive": 0,
    "totalReformulated": 0,
    "totalRetired": 0
  },
  "_schema": {
    "enrichment": {
      "id": "PE-NNN",
      "rule": "string — the enrichment instruction",
      "inject_when": ["mode:feature", "mode:refactor"],
      "inject_to": ["backend-architect", "frontend-architect"],
      "score": "number 0-5, average over last 3 evaluated runs",
      "runs_evaluated": "number — how many runs this PE was evaluated in",
      "status": "active|reformulate|retired",
      "created": "YYYY-MM-DD",
      "lastEvaluated": "YYYY-MM-DD"
    },
    "_scoring": {
      "5": "PE directly prevented an error that occurred in a previous run",
      "4": "PE was followed and contributed to clean output",
      "3": "PE was followed but had no measurable impact",
      "2": "PE was partially followed or unclear",
      "1": "PE was ignored by the agent",
      "0": "PE was counterproductive or caused confusion"
    },
    "_lifecycle": {
      "score < 2 on 3+ runs": "status → reformulate (Sentinelle proposes new wording)",
      "score = 0 on 5+ runs": "status → retired",
      "reformulated PE": "resets runs_evaluated to 0, keeps id with suffix -R1, -R2"
    }
  }
}
```

- [ ] **Step 3: Activate agent-performance.json with ROI tracking**

```json
{
  "agents": {},
  "specializations": {},
  "weaknessHistory": {},
  "lastUpdated": null,
  "stats": {
    "totalEvaluations": 0
  },
  "_schema": {
    "agent_entry": {
      "runs": "number — total runs for this agent",
      "avgScore": "number 1-10 — average quality score across runs",
      "specializations": {
        "<task-type>": "number — avg score for this task type (api-endpoint, migration, ui-component, test-writing, refactor, etc.)"
      },
      "weaknessHistory": ["EP-NNN: description x count"],
      "roi": "high|medium|low|watch|retired"
    },
    "_roi_lifecycle": {
      "high": "avgScore >= 8.0, no recurring weaknesses",
      "medium": "avgScore 6.0-7.9, or some recurring weaknesses",
      "low": "avgScore < 6.0 on 5+ runs → put on watch",
      "watch": "3 more runs on watch with no improvement → propose retirement to user",
      "retired": "user confirmed retirement, agent no longer allocated"
    },
    "_allocation": {
      "prefer": "avgScore > 9.0 for task type AND roi = high",
      "avoid": "avgScore < 7.0 for task type on 3+ runs OR roi = watch/retired",
      "fallback": "use template default if no strong signal"
    }
  }
}
```

- [ ] **Step 4: Activate velocity-metrics.json with run tracking**

```json
{
  "runs": [],
  "lastUpdated": null,
  "averages": {
    "durationMinutes": 0,
    "tasksPerRun": 0,
    "correctiveLoops": 0,
    "escalations": 0,
    "tscFailsPostAgent": 0
  },
  "_schema": {
    "run": {
      "id": "RUN-YYYYMMDD-HHMM",
      "date": "YYYY-MM-DD",
      "mode": "feature|bug|refactor|hotfix|chore|mockup|audit",
      "pipeline": "micro|standard|enterprise",
      "escalated": "false | {from, to, reason}",
      "duration_minutes": "number",
      "agents_spawned": "number",
      "tasks_completed": "number",
      "corrective_loops": "number",
      "tsc_fails_post_agent": "number — import coherence metric",
      "discoveries_flagged": "number",
      "files_modified": "number",
      "lines_changed": "number",
      "tests_added": "number",
      "verdict": "PASS|PASS_WITH_WARNINGS|ESCALATED"
    }
  }
}
```

- [ ] **Step 5: Activate next-run.json with staleness tracking**

```json
{
  "recommendations": [],
  "blockers": [],
  "priorities": [],
  "lastUpdated": null,
  "_schema": {
    "recommendation": {
      "id": "NR-NNN",
      "description": "string — what should be done next",
      "priority": "number 1-10 (10 = most urgent)",
      "source": "sentinelle|tech-lead|auto-escalade",
      "created": "YYYY-MM-DD",
      "staleness_runs": "number — how many runs this has been unaddressed",
      "auto_apply_at": 3,
      "status": "pending|applied|dismissed"
    },
    "_auto_apply": "If staleness_runs >= auto_apply_at AND status = pending → auto-apply at next run start. Log in velocity-metrics."
  }
}
```

- [ ] **Step 6: Activate autonomy-state.json**

```json
{
  "level": "L1",
  "history": [],
  "lastUpdated": null,
  "_schema": {
    "levels": {
      "L1": "Full supervision — user approves plan, reviews each phase",
      "L2": "Notification — user notified at plan phase, not blocking",
      "L3": "Autonomous standard — user notified at end only",
      "L4": "Full autonomous — no notifications except blockers"
    },
    "promotion": "Sentinelle proposes after 3+ consecutive PASS runs → user confirms",
    "demotion": "Any BLOCK failure → immediate reset to L1",
    "history_entry": {
      "date": "YYYY-MM-DD",
      "from": "L1",
      "to": "L2",
      "reason": "string",
      "approved_by": "user|auto-reset"
    }
  }
}
```

- [ ] **Step 7: Activate estimation-accuracy.json**

```json
{
  "estimates": [],
  "lastUpdated": null,
  "accuracy": {
    "avgRatio": 0,
    "totalEstimated": 0
  },
  "_schema": {
    "estimate": {
      "run_id": "RUN-YYYYMMDD-HHMM",
      "estimated_files": "number",
      "actual_files": "number",
      "estimated_lines": "number",
      "actual_lines": "number",
      "estimated_duration_min": "number",
      "actual_duration_min": "number",
      "ratio": "actual / estimated (1.0 = perfect, >1 = underestimate, <1 = overestimate)"
    },
    "_note": "Used to calibrate future estimates. Ratios consistently >1.5 suggest scope creep or underestimation bias."
  }
}
```

- [ ] **Step 8: Commit all KB activations**

```bash
git add .claude/skills/team/team-knowledge/*.json
git commit -m "feat(team): activate KB JSON files — error patterns, PE scoring, agent ROI, velocity, autonomy, estimation"
```

---

## Task 5: New protocol — `finalize.md` (Feedback loop orchestration)

**Files:**
- Create: `.claude/skills/team/team-protocols/finalize.md`

- [ ] **Step 1: Create finalize protocol**

```markdown
# Finalize — Protocole de cloture de run

Execute par le Tech Lead a la fin de chaque run (Phase LIVRER).
Charge en mode **standard** (partiel) et **enterprise** (complet).

---

## STANDARD — Finalize leger

```
1. error-patterns.json: enregistrer toute boucle corrective du run
   - 1 entry par boucle: type, description, agent, phase, fix
   - Si pattern existant (meme type + meme description) → incrementer occurrences + update lastSeen
   - Si nouveau pattern → creer avec status "unfixed" si non resolu dans ce run, "fixed" sinon

2. velocity-metrics.json: enregistrer le run
   - pipeline, mode, duration, agents_spawned, corrective_loops, tsc_fails_post_agent, files_modified

3. quality-ratchet.json: write-on-improve
   - Si testCount augmente → update
   - Si asAnyCount diminue → update
   - Ajouter entry dans history[]
```

---

## ENTERPRISE — Finalize complet

Tout le standard PLUS :

```
4. prompt-enrichments.json: scoring PE
   Pour chaque PE injecte dans ce run :
   a. Evaluer le score (0-5) basé sur :
      - L'agent a-t-il suivi le PE ? (oui=3+, non=1)
      - Le PE a-t-il prevenu une erreur connue ? (oui=5)
      - Le PE a-t-il eu un impact mesurable ? (pas clair=2)
   b. Mettre a jour le score (moyenne glissante sur 3 runs)
   c. Si score < 2 sur 3+ runs → status = "reformulate"
      - Sentinelle propose une nouvelle formulation
      - Nouveau PE cree avec id suffixe -R1
   d. Si score = 0 sur 5+ runs → status = "retired"

5. agent-performance.json: evaluation agent
   Pour chaque agent spawne dans ce run :
   a. Score qualite (1-10) basé sur :
      - Code compile sans erreur au 1er essai ? (+3)
      - Tests passent sans correction ? (+2)
      - Scope respecte ? (+2)
      - Import coherence respectee ? (+2)
      - Decouvertes utiles signalees ? (+1)
   b. Mettre a jour avgScore (moyenne glissante)
   c. Mettre a jour specializations[task-type]
   d. Si erreur recurrente → ajouter a weaknessHistory
   e. Evaluer ROI selon la grille

6. next-run.json: recommandations
   a. Generer recommandations basées sur :
      - Erreurs non corrigees ce run (priority +5)
      - Coverage gaps detectes (priority +4)
      - Process amendments proposes par Sentinelle (priority +3)
      - Optimisations suggerees (priority +1)
   b. Incrementer staleness_runs sur les recommendations existantes non adressees
   c. Si staleness_runs >= 3 → auto-apply (modifier le protocole/mandat concerne)
      - Logger l'auto-apply dans velocity-metrics

7. autonomy-state.json: evaluation niveau
   a. Si 3+ runs consecutifs PASS sans escalade utilisateur → proposer promotion
   b. Si BLOCK failure dans ce run → reset a L1
   c. Logger le changement dans history[]

8. estimation-accuracy.json: calibration
   a. Comparer estimation (fichiers, lignes, duration) vs reel
   b. Calculer ratio
   c. Mettre a jour avgRatio

9. team-reports/YYYY-MM-DD.md: Executive Summary
   - Score global, findings, metriques, recommendations
   - Agent performance summary
   - PE effectiveness summary

10. docs/V1_Sprint/: update tracking
    - PROGRESS_TRACKER.md: cocher les items completes
    - SPRINT_LOG.md: ajouter entry technique
```

---

## CREATION DE NOUVEAUX PE

A chaque finalize enterprise, la Sentinelle peut proposer de nouveaux PE basés sur :

```
1. Erreurs recurrentes (3+ occurrences du meme pattern) → PE preventif
2. Corrections manuelles frequentes par le Tech Lead → PE d'automatisation
3. Decouverte d'un pattern efficace par un agent → PE de partage
```

Format de proposition :
```json
{
  "proposed_pe": {
    "rule": "string",
    "inject_when": ["mode:..."],
    "inject_to": ["agent-name"],
    "justification": "based on EP-NNN recurring N times"
  }
}
```

Le Tech Lead valide ou rejette. Si valide → ajoute a prompt-enrichments.json avec score initial 3.0.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/team/team-protocols/finalize.md
git commit -m "feat(team): add finalize protocol — PE scoring, agent ROI, auto-apply stale amendments"
```

---

## Task 6: New protocol — `gitnexus-integration.md` (Enforced, not aspirational)

**Files:**
- Create: `.claude/skills/team/team-protocols/gitnexus-integration.md`

- [ ] **Step 1: Create GitNexus integration protocol**

```markdown
# GitNexus Integration — Code Intelligence par phase

Protocole d'utilisation OBLIGATOIRE des outils GitNexus MCP a chaque phase du SDLC.
Charge en mode **standard** et **enterprise**.

---

## OUTILS DISPONIBLES

| Outil | Usage | Quand |
|-------|-------|-------|
| `gitnexus_query` | Trouver du code par concept | COMPRENDRE — explorer les execution flows |
| `gitnexus_context` | Vue 360° d'un symbole (callers, callees, processes) | COMPRENDRE + avant suppression |
| `gitnexus_impact` | Blast radius avant modification | AVANT CHAQUE EDIT de symbole existant |
| `gitnexus_detect_changes` | Verifier scope des changements | VERIFIER + pre-commit |
| `gitnexus_rename` | Rename safe multi-fichiers | DEVELOPPER — tout rename de symbole |
| `gitnexus_cypher` | Requetes custom sur le knowledge graph | Cas avances |

---

## USAGE PAR PHASE

### COMPRENDRE (toutes pipelines)
```
gitnexus_query({query: "<sujet de la tache>"})
→ Trouver les execution flows lies
→ Identifier les fichiers et symboles concernes
→ Optionnel: gitnexus_context({name: "<symbole cle>"}) si besoin de la vue 360°
```

### CONCEVOIR (enterprise uniquement)
```
Pour chaque symbole cle qui sera modifie :
gitnexus_impact({target: "<symbol>", direction: "upstream"})
→ Lister les dependants par profondeur:
  - d=1: WILL BREAK — DOIVENT etre mis a jour
  - d=2: LIKELY AFFECTED — devraient etre testes
  - d=3: MAY NEED TESTING — tester si chemin critique

Si risk = HIGH ou CRITICAL → ALERTER l'utilisateur avant de continuer
```

### DEVELOPPER (standard + enterprise)
```
AVANT chaque modification de symbole existant:
gitnexus_impact({target: "<symbol>", direction: "upstream"})
→ cf. import-coherence.md niveau 1

POUR chaque rename:
gitnexus_rename({symbol_name: "<old>", new_name: "<new>", dry_run: true})
→ Review → gitnexus_rename({dry_run: false})

POUR chaque suppression:
gitnexus_context({name: "<fichier/symbole>"})
→ cf. import-coherence.md niveau 1 — delete protocol
```

### VERIFIER (standard + enterprise)
```
gitnexus_detect_changes({scope: "staged"})
→ Comparer avec le scope attendu
→ Si fichiers inattendus modifies → WARN
→ Inclure dans le rapport de porte Sentinelle
```

### LIVRER (enterprise uniquement)
```
gitnexus_detect_changes({scope: "all"})
→ Verification finale: changements = scope attendu
→ Si divergence → BLOCK commit, investiguer
```

---

## ENFORCEMENT

Ce protocole n'est PAS aspirationnel. Il est OBLIGATOIRE.

### Dans les mandats agents
Chaque mandat DEV DOIT inclure la section COHERENCE IMPORTS (cf. import-coherence.md)
qui reference explicitement les outils GitNexus a utiliser.

### Verification par la Sentinelle
La Sentinelle verifie a chaque porte :
1. gitnexus_detect_changes a-t-il ete appele ? (enterprise: obligatoire)
2. Les fichiers changes correspondent-ils au scope du mandat ?
3. Les d=1 dependants sont-ils traites ?

### Metriques
Tracker dans velocity-metrics.json :
- Nombre d'appels GitNexus par run
- Nombre de conflits detectes AVANT vs APRES les gates
- Tendance: si les conflits pre-gate augmentent, le shift-left fonctionne

---

## INDEX FRESHNESS

Si un outil GitNexus retourne un warning "stale index" :
1. STOP — ne pas continuer sans index frais
2. Executer: `npx gitnexus analyze` (ou `--embeddings` si embeddings existaient)
3. Verifier `.gitnexus/meta.json > stats` pour confirmer la mise a jour
4. Reprendre le travail

Le hook PostToolUse re-indexe automatiquement apres `git commit` et `git merge`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/team/team-protocols/gitnexus-integration.md
git commit -m "feat(team): add gitnexus-integration protocol — enforced per-phase with shift-left metrics"
```

---

## Task 7: New protocols — `error-taxonomy.md` + `conflict-resolution.md`

**Files:**
- Create: `.claude/skills/team/team-protocols/error-taxonomy.md`
- Create: `.claude/skills/team/team-protocols/conflict-resolution.md`

- [ ] **Step 1: Create error-taxonomy.md**

```markdown
# Error Taxonomy — Classification et reponse

Classification des erreurs rencontrees pendant un run SDLC.
Charge en mode **enterprise** uniquement.

---

## CLASSES D'ERREURS

| Code | Type | Description | Severite par defaut |
|------|------|-------------|---------------------|
| E-IMPORT | Import casse | Symbole/fichier importe n'existe pas ou a change de signature | HIGH |
| E-TYPE | Type mismatch | Types incompatibles entre modules ou agent outputs | HIGH |
| E-SCOPE | Scope overflow | Agent modifie des fichiers hors de son scope autorise | MEDIUM |
| E-TEST | Test regression | Tests existants cassent apres modification | HIGH |
| E-LINT | Lint violation | Nouveau eslint-disable ou tsc error | MEDIUM |
| E-ARCH | Architecture violation | Non-respect des patterns hexagonaux, imports cross-feature | LOW |
| E-RUNTIME | Runtime error | Erreur detectee au smoke test ou E2E | CRITICAL |
| E-STYLE | Style/convention | Nommage incorrect, fichier mal place | LOW |

## RESPONSE MATRIX

| Severite | Bloque commit ? | Action immediate ? | Boucle corrective ? | Escalade apres |
|----------|----------------|-------------------|---------------------|----------------|
| CRITICAL | Oui | Oui | Oui — prioritaire | 1 tentative |
| HIGH | Oui | Oui | Oui | 2 tentatives |
| MEDIUM | Non (WARN) | Recommande | Optionnel | 3 tentatives |
| LOW | Non | Non | Non | Jamais |

## BOUCLE CORRECTIVE

```
1. Identifier la classe d'erreur (E-IMPORT, E-TYPE, etc.)
2. Determiner le point de retour:
   - E-IMPORT, E-TYPE → retour DEVELOPPER (meme agent si c'est son scope)
   - E-SCOPE → retour PLANIFIER (le scope etait mal defini)
   - E-TEST → retour DEVELOPPER (agent corrige)
   - E-ARCH → retour CONCEVOIR (si structural) ou DEVELOPPER (si local)
   - E-RUNTIME → retour TESTER (agent QA investigue)
3. Creer TaskCreate("correction-{phase}-{error_code}-{loop_count}")
4. Spawner agent de correction avec:
   - Message d'erreur exact
   - Fichiers concernes
   - PE pertinents (si EP existe pour ce type d'erreur)
5. Re-executer depuis le point de correction
6. Max 3 boucles (2 pour CRITICAL) → escalade utilisateur
```

## ENREGISTREMENT

Chaque boucle corrective = 1 entry dans error-patterns.json (cf. finalize.md).
```

- [ ] **Step 2: Create conflict-resolution.md**

```markdown
# Conflict Resolution — Protocole de resolution

Quand 2 agents ou le Tech Lead et un agent ont des conclusions contradictoires.
Charge en mode **enterprise** uniquement.

---

## PROCEDURE

```
1. EVIDENCE — Chaque partie presente ses preuves (code, tests, metriques)
2. CROSS-VALIDATION — Le Tech Lead fait sa propre verification independante
3. SYNTHESE — Determiner quelle approche est correcte basee sur les faits
4. ESCALADE — Si impossible de trancher → demander a l'utilisateur
```

## CAS COURANTS

### Agent A et Agent B modifient le meme fichier
```
1. Identifier qui a modifie en premier (timestamps)
2. Si modifications non-conflictuelles → merge manuel par Tech Lead
3. Si modifications conflictuelles → choisir la version la plus coherente
4. L'autre agent est respawne avec les modifications mergees comme contexte
```

### Agent contredit le plan
```
1. L'agent a-t-il une raison technique valide ? (Discovery)
2. Si oui → Tech Lead evalue et ajuste le plan
3. Si non → l'agent re-execute selon le plan original
```

### Sentinelle FAIL conteste par le Tech Lead
```
1. Le Tech Lead doit fournir une justification ecrite
2. La justification est loguee dans le rapport de run
3. Le run peut continuer avec un WARN (pas PASS)
4. L'overrule est enregistre dans velocity-metrics pour suivi
```
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/team/team-protocols/error-taxonomy.md .claude/skills/team/team-protocols/conflict-resolution.md
git commit -m "feat(team): add error-taxonomy and conflict-resolution protocols"
```

---

## Task 8: Enrich `agent-mandate.md` with shift-left checklist

**Files:**
- Modify: `.claude/skills/team/team-protocols/agent-mandate.md:30-73`

- [ ] **Step 1: Add COHERENCE IMPORTS section to the mandate template**

After the existing `### CONTRAINTES` section (line 30) and before `### REGLES TECHNIQUES` (line 33), add a new section. Replace the `### REGLES TECHNIQUES` block (lines 33-62) with an expanded version that includes import coherence:

In `agent-mandate.md`, replace lines 33-62 (the REGLES TECHNIQUES section) with:

```markdown
### COHERENCE IMPORTS (OBLIGATOIRE)

AVANT de modifier/supprimer/renommer un symbole ou fichier :
1. Run gitnexus_impact({target: "symbolName", direction: "upstream"})
2. Lire la liste des dependants d=1 (WILL BREAK)
3. Si dependants d=1 dans ton scope → les inclure dans tes modifications
4. Si dependants d=1 hors scope → FLAG comme Discovery (NE PAS modifier)
5. NE JAMAIS supprimer un fichier sans traiter ses importers (gitnexus_context)
6. NE JAMAIS renommer sans gitnexus_rename({dry_run: true}) d'abord

AVANT de creer un nouveau fichier :
1. Utiliser les path aliases (@src/, @/, @modules/) pour les imports
2. Mettre a jour le barrel index.ts parent si necessaire

Violation = FAIL de porte automatique.

### REGLES TECHNIQUES

REGLE ESLINT ABSOLUE: Tu ne dois JAMAIS ajouter de `eslint-disable` sauf pour les
categories autorisees dans CLAUDE.md § "ESLint Discipline > Justified disable patterns".
Si ESLint signale un probleme, tu DOIS refactorer le code pour satisfaire la regle.
Cherche la doc, cherche l'alternative, change ta maniere de penser.

Allowlist (seules exceptions autorisees):
- prefer-nullish-coalescing — traitement intentionnel de "" comme falsy
- no-unnecessary-condition — frontiere de confiance (JWT, DB row, API externe)
- require-await — implementation no-op d'interface async
- no-unnecessary-type-parameters — generic API pour inference des callers
- no-require-imports — pattern React Native require() ou chargement conditionnel OTel
- no-control-regex — sanitisation input
- sonarjs/hashing — checksum non-crypto (S3 Content-MD5)
- sonarjs/pseudo-random — jitter/backoff, pas securite
- react-hooks/refs — React Native Animated.Value / PanResponder refs read once at creation

REGLE TESTS DRY: Tu ne dois JAMAIS creer d'entites de test inline (as User, as ChatMessage, etc.).
Utilise TOUJOURS les factories partagees de tests/helpers/ :
- makeUser(overrides?) depuis tests/helpers/auth/user.fixtures.ts
- makeMessage(overrides?) depuis tests/helpers/chat/message.fixtures.ts
- makeSession(overrides?) depuis tests/helpers/chat/message.fixtures.ts
- makeToken(overrides?) depuis tests/helpers/auth/token.helpers.ts
- makeRepo(overrides?) depuis tests/helpers/chat/repo.fixtures.ts (a creer si inexistant)
- makeCache(overrides?) depuis tests/helpers/chat/cache.fixtures.ts (a creer si inexistant)

Si une factory partagee n'existe pas encore pour ton entite/mock, tu DOIS la creer
dans tests/helpers/<module>/<entity>.fixtures.ts AVANT de l'utiliser dans tes tests.
Chaque factory suit le pattern: valeurs par defaut sensees + overrides partiels.
```

- [ ] **Step 2: Verify the edit**

```bash
grep -c "COHERENCE IMPORTS" .claude/skills/team/team-protocols/agent-mandate.md
```
Expected: 1

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/team/team-protocols/agent-mandate.md
git commit -m "feat(team): add COHERENCE IMPORTS shift-left section to agent mandate template"
```

---

## Task 9: Enrich `quality-gates.md` with inter-agent scoped tsc

**Files:**
- Modify: `.claude/skills/team/team-protocols/quality-gates.md:100-111`

- [ ] **Step 1: Replace Step 6 Self-Verification with an enhanced version**

In `quality-gates.md`, replace lines 100-111 (Step 6 — Self-Verification Agent) with:

```markdown
### Step 6 — Self-Verification Agent

Chaque agent DEV doit, AVANT de rendre son travail :

```
1. Relire chaque fichier modifie en entier
2. Verifier la coherence des imports (gitnexus_impact sur chaque symbole modifie)
3. S'assurer que les types compilent (tsc mental check)
4. Verifier qu'aucun console.log de debug ne reste
5. Confirmer que les tests couvrent le code ajoute
6. Reporter toute Discovery hors-scope dans le rapport de self-verification
```

### Step 7 — Inter-Agent Scoped tsc (standard + enterprise)

Execute par le Tech Lead apres chaque agent DEV, AVANT la porte Sentinelle.
Cf. `import-coherence.md` niveau 2 pour le protocole complet.

```bash
# Lister fichiers modifies
CHANGED=$(git diff --name-only HEAD)

# Scoped tsc backend (si fichiers backend modifies)
cd museum-backend && npx tsc --noEmit 2>&1 | head -20

# Scoped tsc frontend (si fichiers frontend modifies)
cd museum-frontend && npx tsc --noEmit 2>&1 | head -20
```

| Resultat | Action |
|----------|--------|
| 0 erreurs | PASS — continuer |
| Erreurs dans fichiers de l'agent | Renvoyer au meme agent (max 2 retours) |
| Erreurs cascade (fichiers non modifies) | Tech Lead resout |
| 3e echec | Escalade utilisateur |
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/team/team-protocols/quality-gates.md
git commit -m "feat(team): add inter-agent scoped tsc step to quality gates"
```

---

## Task 10: Rewrite `SKILL.md` as pure dispatcher (~130L)

**Files:**
- Modify: `.claude/skills/team/SKILL.md` (full rewrite from 409L to ~130L)

This is the final task — it depends on all protocols and templates being in place.

- [ ] **Step 1: Backup current SKILL.md**

```bash
cp .claude/skills/team/SKILL.md .claude/skills/team/SKILL.md.v2.bak
```

- [ ] **Step 2: Rewrite SKILL.md as pure dispatcher**

Replace entire content of `.claude/skills/team/SKILL.md` with:

```markdown
---
description: 'SDLC multi-agents Musaium — orchestrateur enterprise-grade avec Agent Teams natifs, parallelisme reel, quality gates automatises'
argument-hint: '[type?:feature|bug|mockup|refactor|hotfix|chore|audit] [description de la tache]'
---

# /team v3 — Orchestrateur SDLC Musaium

Dispatcher utilisant **Agent Teams natifs** (TeamCreate, TaskCreate, SendMessage).
3 pipelines (micro/standard/enterprise), import coherence, feedback loop.

---

## DIRECTIVE

Tu es le **Tech Lead**. Tu dispatches vers le bon pipeline et orchestres le cycle.

**REGLES ABSOLUES :**
1. NE JAMAIS avancer sans que les gates du pipeline soient PASS
2. La Sentinelle = 1 agent persistant (standard + enterprise) (`.claude/agents/process-auditor.md`)
3. Tous les agents sur **opus**
4. Les agents ne commitent PAS — seul le Tech Lead git add/commit/push
5. Les agents n'ecrivent PAS dans team-knowledge/ ni team-reports/
6. Si 3 boucles correctives → escalade utilisateur

---

## EXECUTION

### Step 1 — Parse & Classify

```
1. Extraire mode (explicite ou infere) : feature|bug|refactor|hotfix|chore|mockup|audit
2. Extraire description
3. Determiner scope : backend-only | frontend-only | full-stack | infra
4. Si ambiguite → demander a l'utilisateur
```

### Step 2 — Select Pipeline

Lire `team-protocols/sdlc-pipelines.md` pour la matrice mode → pipeline.

```
Classification automatique:
  micro:      ≤5 fichiers ET ≤200 lignes ET single-scope
  standard:   6-20 fichiers OU multi-scope OU interface publique modifiee
  enterprise: 20+ fichiers OU cross-module OU migration DB OU security-sensitive
```

### Step 3 — Smart Context Loading

Charger UNIQUEMENT les fichiers requis par le pipeline :

| Pipeline | Fichiers charges |
|----------|-----------------|
| **micro** | quality-ratchet.json + error-patterns.json (unfixed) + micro.md |
| **standard** | + quality-gates.md + agent-mandate.md + import-coherence.md + prompt-enrichments.json + standard.md |
| **enterprise** | + tous les protocoles + tous les KB JSON + enterprise.md |

### Step 4 — Execute Pipeline

Suivre le template du pipeline selectionne :
- `team-templates/micro.md` → 3 phases, 0 Sentinelle
- `team-templates/standard.md` → 7 phases, Sentinelle legere
- `team-templates/enterprise.md` → 13 phases, Sentinelle complete

Pour chaque phase active du template :
```
1. TaskUpdate(phase_task, status: "in_progress")
2. Executer la phase selon le template
3. Si phase DEV (standard + enterprise) :
   a. Construire mandats (cf. agent-mandate.md) avec section COHERENCE IMPORTS
   b. Injecter PE + EP pertinents
   c. Spawner agents en parallele si multi-scope
   d. Post-agent: scoped tsc (cf. import-coherence.md niveau 2)
4. Si gate requise → rapport de porte (cf. quality-gates.md)
5. Si FAIL → boucle corrective (cf. error-taxonomy.md)
6. Si PASS → TaskUpdate(phase_task, status: "completed")
```

### Step 5 — Finalize

Apres la derniere phase LIVRER :
```
1. Executer le protocole finalize (cf. finalize.md) selon le pipeline:
   - micro: velocity-metrics + quality-ratchet seulement
   - standard: + error-patterns
   - enterprise: + PE scoring + agent ROI + next-run + autonomy + rapport
2. git add + commit
```

### Step 6 — Resume Protocol

Si une team existante est detectee :
```
1. Proposer: "Team {name} en cours. Resume / Abandon / New ?"
2. Si resume → reprendre depuis le dernier task non-completed
```

---

## PROTOCOLES

| Protocole | Fichier | Charge en |
|-----------|---------|-----------|
| Pipelines & phases | `team-protocols/sdlc-pipelines.md` | Toujours |
| Quality gates | `team-protocols/quality-gates.md` | Standard + Enterprise |
| Agent mandates | `team-protocols/agent-mandate.md` | Standard + Enterprise |
| Import coherence | `team-protocols/import-coherence.md` | Standard + Enterprise |
| GitNexus integration | `team-protocols/gitnexus-integration.md` | Standard + Enterprise |
| Finalize & KB | `team-protocols/finalize.md` | Standard (partiel) + Enterprise |
| Error taxonomy | `team-protocols/error-taxonomy.md` | Enterprise |
| Conflict resolution | `team-protocols/conflict-resolution.md` | Enterprise |

## TEMPLATES

| Pipeline | Template | Phases |
|----------|----------|--------|
| micro | `team-templates/micro.md` | 3 |
| standard | `team-templates/standard.md` | 7 |
| enterprise | `team-templates/enterprise.md` | 13 |
| audit | `team-templates/audit.md` | 3 (inchange) |

## SKILL COMPOSABILITY

Chainer des skills avant/dans un run :
```
/team compose:skill1,skill2 [mode] [description]
```
Exemples : `/team compose:recap,feature "ajouter pagination"`, `/team compose:semgrep,security-scan "audit OWASP"`

## SKILLS DISPONIBLES

### Internes
/recap, /security-scan, /test-writer, /verify-schema, /test-routes, /rollback

### GitNexus
gitnexus-exploring, gitnexus-debugging, gitnexus-impact-analysis, gitnexus-refactoring, gitnexus-cli, gitnexus-guide

### Communautaires Tier 1
/langchain-fundamentals, /langchain-rag, /langchain-middleware, /skill-creator, /semgrep, /codeql, /supply-chain-auditor, /variant-analysis, verification-before-completion

### Communautaires Tier 2
/pentest-checklist, /security-compliance, /vulnerability-scanner, /browser-use, /backend-patterns
```

- [ ] **Step 3: Verify line count**

```bash
wc -l .claude/skills/team/SKILL.md
```
Expected: ~130 lines (should be between 120-140)

- [ ] **Step 4: Verify all protocol references resolve**

```bash
# Check all referenced files exist
for f in team-protocols/sdlc-pipelines.md team-protocols/quality-gates.md team-protocols/agent-mandate.md team-protocols/import-coherence.md team-protocols/gitnexus-integration.md team-protocols/finalize.md team-protocols/error-taxonomy.md team-protocols/conflict-resolution.md team-templates/micro.md team-templates/standard.md team-templates/enterprise.md team-templates/audit.md; do
  if [ -f ".claude/skills/team/$f" ]; then echo "OK: $f"; else echo "MISSING: $f"; fi
done
```
Expected: all OK, zero MISSING

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/team/SKILL.md .claude/skills/team/SKILL.md.v2.bak
git commit -m "feat(team): rewrite SKILL.md as pure dispatcher v3 — 409L → ~130L, zero business rules inline"
```

---

## Task 11: Seed initial Prompt Enrichments from known patterns

**Files:**
- Modify: `.claude/skills/team/team-knowledge/prompt-enrichments.json`

- [ ] **Step 1: Seed PE entries based on known error patterns**

These are the initial PE entries based on the design discussion and known problems:

```json
{
  "enrichments": [
    {
      "id": "PE-001",
      "rule": "AVANT de supprimer un fichier, toujours run gitnexus_context pour lister tous les importers. Traiter chaque importer avant de supprimer.",
      "inject_when": ["mode:feature", "mode:refactor", "mode:bug"],
      "inject_to": ["backend-architect", "frontend-architect"],
      "score": 3.0,
      "runs_evaluated": 0,
      "status": "active",
      "created": "2026-04-05",
      "lastEvaluated": null
    },
    {
      "id": "PE-002",
      "rule": "AVANT de modifier la signature d'une fonction exportee, run gitnexus_impact upstream pour identifier tous les callers. Mettre a jour chaque caller dans ton scope.",
      "inject_when": ["mode:feature", "mode:refactor"],
      "inject_to": ["backend-architect", "frontend-architect"],
      "score": 3.0,
      "runs_evaluated": 0,
      "status": "active",
      "created": "2026-04-05",
      "lastEvaluated": null
    },
    {
      "id": "PE-003",
      "rule": "Utiliser les path aliases (@src/, @modules/, @shared/ pour backend, @/ pour frontend) pour tous les imports. Jamais de chemins relatifs profonds (../../..).",
      "inject_when": ["mode:feature", "mode:refactor", "mode:bug"],
      "inject_to": ["backend-architect", "frontend-architect"],
      "score": 3.0,
      "runs_evaluated": 0,
      "status": "active",
      "created": "2026-04-05",
      "lastEvaluated": null
    },
    {
      "id": "PE-004",
      "rule": "Quand tu crees un nouveau fichier qui exporte des symboles, verifier que le barrel index.ts parent re-exporte si necessaire. Ne pas creer d'exports orphelins.",
      "inject_when": ["mode:feature"],
      "inject_to": ["backend-architect", "frontend-architect"],
      "score": 3.0,
      "runs_evaluated": 0,
      "status": "active",
      "created": "2026-04-05",
      "lastEvaluated": null
    },
    {
      "id": "PE-005",
      "rule": "Apres avoir fini tes modifications, relire la liste complete des imports de chaque fichier modifie. Supprimer les imports inutilises. Verifier que chaque import pointe vers un fichier/symbole existant.",
      "inject_when": ["mode:feature", "mode:refactor", "mode:bug"],
      "inject_to": ["backend-architect", "frontend-architect"],
      "score": 3.0,
      "runs_evaluated": 0,
      "status": "active",
      "created": "2026-04-05",
      "lastEvaluated": null
    }
  ],
  "lastUpdated": "2026-04-05",
  "stats": {
    "totalActive": 5,
    "totalReformulated": 0,
    "totalRetired": 0
  },
  "_schema": {
    "enrichment": {
      "id": "PE-NNN",
      "rule": "string — the enrichment instruction",
      "inject_when": ["mode:feature", "mode:refactor"],
      "inject_to": ["backend-architect", "frontend-architect"],
      "score": "number 0-5, average over last 3 evaluated runs",
      "runs_evaluated": "number — how many runs this PE was evaluated in",
      "status": "active|reformulate|retired",
      "created": "YYYY-MM-DD",
      "lastEvaluated": "YYYY-MM-DD"
    },
    "_scoring": {
      "5": "PE directly prevented an error that occurred in a previous run",
      "4": "PE was followed and contributed to clean output",
      "3": "PE was followed but had no measurable impact",
      "2": "PE was partially followed or unclear",
      "1": "PE was ignored by the agent",
      "0": "PE was counterproductive or caused confusion"
    },
    "_lifecycle": {
      "score < 2 on 3+ runs": "status → reformulate (Sentinelle proposes new wording)",
      "score = 0 on 5+ runs": "status → retired",
      "reformulated PE": "resets runs_evaluated to 0, keeps id with suffix -R1, -R2"
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/team/team-knowledge/prompt-enrichments.json
git commit -m "feat(team): seed 5 initial prompt enrichments for import coherence patterns"
```

---

## Task 12: Final verification

- [ ] **Step 1: Verify all files exist and reference integrity**

```bash
echo "=== Protocol files ==="
ls -la .claude/skills/team/team-protocols/
echo ""
echo "=== Template files ==="
ls -la .claude/skills/team/team-templates/
echo ""
echo "=== KB files ==="
ls -la .claude/skills/team/team-knowledge/
echo ""
echo "=== SKILL.md line count ==="
wc -l .claude/skills/team/SKILL.md
echo ""
echo "=== Total context per pipeline ==="
echo "MICRO:"
wc -l .claude/skills/team/SKILL.md .claude/skills/team/team-templates/micro.md .claude/skills/team/team-knowledge/quality-ratchet.json .claude/skills/team/team-knowledge/error-patterns.json 2>/dev/null | tail -1
echo "STANDARD:"
wc -l .claude/skills/team/SKILL.md .claude/skills/team/team-templates/standard.md .claude/skills/team/team-protocols/quality-gates.md .claude/skills/team/team-protocols/agent-mandate.md .claude/skills/team/team-protocols/import-coherence.md .claude/skills/team/team-knowledge/quality-ratchet.json .claude/skills/team/team-knowledge/error-patterns.json .claude/skills/team/team-knowledge/prompt-enrichments.json 2>/dev/null | tail -1
echo "ENTERPRISE:"
wc -l .claude/skills/team/SKILL.md .claude/skills/team/team-templates/enterprise.md .claude/skills/team/team-protocols/*.md .claude/skills/team/team-knowledge/*.json 2>/dev/null | tail -1
```

- [ ] **Step 2: Verify no broken internal references in SKILL.md**

```bash
# Extract all file references from SKILL.md and check they exist
grep -oP '(team-protocols|team-templates|team-knowledge)/[^\s\`\)]+' .claude/skills/team/SKILL.md | sort -u | while read f; do
  if [ -f ".claude/skills/team/$f" ]; then echo "OK: $f"; else echo "MISSING: $f"; fi
done
```

- [ ] **Step 3: Final commit (if any remaining changes)**

```bash
git status
# If any unstaged changes remain, add and commit
```

---

## Summary

| Task | What | Priority |
|------|------|----------|
| 1 | `import-coherence.md` — core anti-import-breakage protocol | B (critical) |
| 2 | `sdlc-pipelines.md` — micro/standard/enterprise tiers | B+C |
| 3 | `micro.md` + `standard.md` + `enterprise.md` templates | B+C |
| 4 | Activate 7 KB JSON files with schemas | C (critical) |
| 5 | `finalize.md` — feedback loop orchestration | C (critical) |
| 6 | `gitnexus-integration.md` — enforced per-phase | B |
| 7 | `error-taxonomy.md` + `conflict-resolution.md` | B |
| 8 | Enrich `agent-mandate.md` with shift-left checklist | B |
| 9 | Enrich `quality-gates.md` with inter-agent scoped tsc | B |
| 10 | Rewrite `SKILL.md` as ~130L dispatcher | B+C |
| 11 | Seed initial Prompt Enrichments | C |
| 12 | Final verification | B+C |
