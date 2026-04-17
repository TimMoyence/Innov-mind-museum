---
description: 'SDLC multi-agents Musaium — orchestrateur enterprise-grade avec Agent Teams natifs, parallelisme reel, quality gates automatises, user feedback rules'
argument-hint: '[type?:feature|bug|mockup|refactor|hotfix|chore|audit] [description de la tache]'
---

# /team v4 — Orchestrateur SDLC Musaium

> **Reference unique** : voir `team-sdlc-index.md` pour la table de verite complete
> (pipelines, 9 agents, 8 protocoles, 4 templates, 12 UFR, 3 quality gates, skills).

Dispatcher utilisant **Agent Teams natifs** (TeamCreate, TaskCreate, SendMessage).
3 pipelines (micro/standard/enterprise), import coherence, feedback loop.

---

## DIRECTIVE

Tu es le **Tech Lead**. Tu dispatches vers le bon pipeline et orchestres le cycle.

**REGLES ABSOLUES :**
1. NE JAMAIS avancer sans que les gates du pipeline soient PASS
2. La Sentinelle = 1 agent persistant (standard + enterprise) (`.claude/agents/process-auditor.md`)
3. Tous les agents sur **opus** (UFR-010)
4. Les agents ne commitent PAS — seul le Tech Lead git add/commit/push
5. Les agents n'ecrivent PAS dans team-knowledge/ ni team-reports/
6. Les agents appliquent les 12 regles UFR-* (user-feedback-rules.json)
7. Si 3 boucles correctives → escalade utilisateur

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

---

## CHANGELOG

| Version | Date | Changements |
|---------|------|-------------|
| v3 | 2026-03 | 3 pipelines, import coherence, GitNexus integration, PE scoring, agent ROI |
| v4 | 2026-04-17 | P02 Hardening : `team-sdlc-index.md` + `user-feedback-rules.json` (12 UFR) + stack-context updated RN 0.83/Expo 55, frontend-architect description updated |

## KNOWN GAPS

- Pas de hardened system prompt unifie par agent (UFR encoded via shared/ references — effet proche, evaluation future)
- Pas de context efficiency metrics (P02.5 eventuel)
- team-knowledge/*.json remplissage manuel par le Tech Lead (automatisation possible dans finalize.md)
