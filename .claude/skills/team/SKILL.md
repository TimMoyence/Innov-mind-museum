---
description: 'SDLC multi-agents Musaium — orchestrateur enterprise-grade avec Agent Teams natifs, parallelisme reel, quality gates automatises'
argument-hint: '[type?:feature|bug|mockup|refactor|hotfix|chore|audit] [description de la tache]'
---

# /team — Orchestrateur SDLC Musaium v2

Dispatcher enterprise-grade utilisant **Agent Teams natifs** (TeamCreate, TaskCreate, SendMessage).
Parallelisme reel, quality gates par hooks, protocoles externalises.

---

## DIRECTIVE

Tu es le **Tech Lead**. Tu orchestres un cycle SDLC iteratif :
- **7 phases** (Analyse → Design → Plan → Dev → Review → Test → Ship)
- **6 portes Sentinelle** bloquantes
- **1 validation utilisateur** (apres Plan)
- **Boucles correctives** max 3 iterations

**REGLES ABSOLUES** :
1. NE JAMAIS avancer sans verdict Sentinelle PASS
2. La Sentinelle = 1 agent persistant toute la session (`.claude/agents/process-auditor.md`)
3. Tous les agents sur **opus**
4. Les agents ne commitent PAS — seul le Tech Lead git add/commit/push
5. Les agents n'ecrivent PAS dans team-knowledge/ ni team-reports/
6. Si 3 boucles correctives → escalade utilisateur
7. Deploy en fin de feature uniquement

## PROTOCOLES EXTERNES

| Fichier | Contenu |
|---------|---------|
| `team-protocols/sdlc-cycle.md` | Les 7 phases, contracts, outputs, gates, DoD par mode |
| `team-protocols/quality-gates.md` | Verification Pipeline, Pre-flight, Self-verification |
| `team-protocols/agent-mandate.md` | Template mandat, viabilite, agents disponibles, allocation |
| `team-protocols/error-taxonomy.md` | Classification erreurs, protocole de correction, boucles |
| `team-protocols/quality-ratchet.md` | Metriques a cliquet, mesure, write-on-improve |
| `team-protocols/conflict-resolution.md` | Evidence → cross-validation → synthese → escalade |
| `team-protocols/finalize.md` | KB update, report, autonomie, detection proactive, IL |

## TEMPLATES D'EQUIPE

| Mode | Template | Phases actives |
|------|----------|----------------|
| `feature` (full-stack) | `team-templates/feature-fullstack.md` | Toutes (cycle complet) |
| `feature` (backend) | `team-templates/feature-backend.md` | Toutes |
| `feature` (frontend) | `team-templates/feature-frontend.md` | Toutes |
| `bug` | `team-templates/bug.md` | Analyse FOCUSED → Plan LIGHT → Dev → Test REGRESSION |
| `refactor` | `team-templates/refactor.md` | Analyse → Plan → Dev → Review → Test |
| `hotfix` | `team-templates/hotfix.md` | Analyse EXPRESS → Dev → Test MINIMAL → Ship FAST |
| `mockup` | `team-templates/mockup.md` | Analyse → Design → Plan → Dev UI |
| `chore` | `team-templates/chore.md` | Analyse LIGHT → Dev TARGETED → Ship IF_NEEDED |
| `audit` | `team-templates/audit.md` | Scan parallel → Consolidate → Report |

---

## EXECUTION

A l'invocation de `/team [args]` :

### Step 1 — Parse & Classify

```
1. Extraire mode (explicite `/team bug:` ou infere du contexte)
2. Extraire description
3. Determiner scope: backend-only | frontend-only | full-stack | infra
4. Si ambiguite → demander a l'utilisateur
```

### Step 2 — Load Context (Smart Context Loading)

```
1. Lire team-knowledge/*.json (7 fichiers — source de verite)
2. Lire le template du mode: team-templates/{mode}.md
3. Lire le dernier rapport (team-reports/) → recommandations actives
4. git log --oneline -5 → dernier contexte
5. Filtrer prompt-enrichments.json par inject_when pertinent au scope
6. Filtrer error-patterns.json par patterns unfixed pertinents
```

### Step 3 — Create Team

```
TeamCreate("musaium-{mode}-{YYYYMMDD-HHmm}")
```

### Step 4 — Create Tasks from Template

Lire le template pour obtenir le **Task Graph** et creer les tasks :

```
TaskCreate pour chaque phase active du template
TaskUpdate pour les blockedBy (dependencies)
```

Exemple feature-fullstack :
```
T1: ANALYSE         (blockedBy: rien)
T2: DESIGN          (blockedBy: T1)
T3: PLAN            (blockedBy: T2)
T4: DEV-backend     (blockedBy: T3)
T5: DEV-frontend    (blockedBy: T3)    ← parallele avec T4
T6: DEV-api         (blockedBy: T3)    ← parallele avec T4, T5
T7: REVIEW          (blockedBy: T4, T5, T6)
T8: TEST            (blockedBy: T7)
T9: SHIP            (blockedBy: T8)
```

### Step 5 — Spawn Sentinelle

```
Agent(
  subagent_type: "process-auditor",
  team_name: "{team}",
  name: "sentinelle",
  run_in_background: true,
  prompt: SENTINEL_INIT protocol (mode, scope, KB summary, active recommendations, PE enrichments)
)
```

Attendre ACK structure avant de continuer.

### Step 6 — Execute Pre-flight

Executer le Pre-flight Check (cf. `quality-gates.md`) :

```bash
cd museum-backend && pnpm lint 2>&1 | tail -3
cd museum-backend && pnpm test 2>&1 | tail -5
cd museum-frontend && npm run lint 2>&1 | tail -3
```

Etablir la baseline. Envoyer a la Sentinelle via SendMessage.

### Step 7 — Phase Loop

Pour chaque phase active du template :

```
1. TaskUpdate(phase_task, status: "in_progress")
2. Executer la phase (cf. sdlc-cycle.md pour le detail)
3. Si phase DEV:
   a. Construire les mandats (cf. agent-mandate.md)
   b. Injecter PE + EP pertinents dans chaque mandat
   c. Spawner les agents DEV en PARALLELE REEL:
      Agent(subagent_type: "backend-architect", team_name, run_in_background: true)
      Agent(subagent_type: "frontend-architect", team_name, run_in_background: true)
   d. Attendre completion de tous les agents
4. Verification Pipeline (cf. quality-gates.md)
5. SendMessage(to: "sentinelle", prompt: rapport de porte structure)
6. Attendre verdict PASS/WARN/FAIL
7. Si FAIL → boucle corrective (cf. error-taxonomy.md)
8. Si PASS → TaskUpdate(phase_task, status: "completed")
```

### Step 8 — User Validation (Phase PLAN)

```
Presenter le plan a l'utilisateur.
BLOQUANT sauf: hotfix, bug evident.
En L2+ pour modes autonomes: notification, pas approbation.
```

### Step 9 — Boucle Corrective

Si Sentinelle FAIL :

```
1. Diagnostiquer: Code → retour DEV | Design → retour DESIGN | Requirement → ANALYSE
2. Creer TaskCreate("correction-{phase}-{loop_count}")
3. Spawner agent de correction avec mandat cible
4. Re-executer depuis le point de correction
5. Si loop_count >= 3 → escalade utilisateur
```

### Step 10 — FINALIZE

Apres PORTE SENTINELLE FINALE :

```
1. SendMessage(to: "sentinelle", prompt: "FIN DE RUN" + metriques post-run)
2. Attendre message structure de la Sentinelle
3. Mettre a jour team-knowledge/*.json (7 fichiers — cf. finalize.md)
4. Ecrire/enrichir team-reports/YYYY-MM-DD.md (Executive Summary + detail)
5. Mettre a jour docs/V1_Sprint/ (PROGRESS_TRACKER + SPRINT_LOG)
6. git add + commit + propose PR si applicable
7. SendMessage(to: "sentinelle", message: {type: "shutdown_request"})
```

### Step 11 — Resume Protocol

Si une team existante est detectee a l'invocation :

```
1. Lire ~/.claude/teams/musaium-*/config.json
2. Si team active trouvee:
   a. Lire TaskList → trouver premier task non-completed non-blocked
   b. Proposer: "Team {name} en cours. Resume / Abandon / New ?"
   c. Si resume → reprendre depuis le task identifie
```

---

## REGLES D'ORCHESTRATION

1. **Cycle-first** — pas de raccourci sauf hotfix
2. **Portes bloquantes** — PASS obligatoire
3. **3 boucles max** → escalade
4. **1 Sentinelle persistante** — spawn debut, SendMessage, shutdown fin
5. **Parallelisme reel** — DEV agents via Agent Teams avec run_in_background
6. **Mandats formels** — cf. agent-mandate.md, toujours avec PE + EP injectes
7. **Typecheck non negociable** — tsc --noEmit avant chaque porte
8. **Hooks automatiques** — lint-on-edit, pre-commit-gate (cf. settings.local.json)
9. **Quality Ratchet** — jamais de regression (cf. quality-ratchet.md)
10. **KB = source de verite** — team-knowledge/*.json persiste entre sessions

---

## SKILL COMPLEMENTAIRE

- **/recap** — Recap quotidien base sur git log et test outputs (lecture seule)
