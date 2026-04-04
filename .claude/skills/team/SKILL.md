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
- **10 phases** (cf. team-protocols/sdlc-cycle.md)
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
| `team-protocols/sdlc-cycle.md` | Les 10 phases, contracts, outputs, gates, DoD par mode |
| `team-protocols/quality-gates.md` | Verification Pipeline, Pre-flight, Self-verification |
| `team-protocols/agent-mandate.md` | Template mandat, viabilite, agents disponibles, allocation |
| `team-protocols/error-taxonomy.md` | Classification erreurs, protocole de correction, boucles |
| `team-protocols/quality-ratchet.md` | Metriques a cliquet, mesure, write-on-improve |
| `team-protocols/conflict-resolution.md` | Evidence → cross-validation → synthese → escalade |
| `team-protocols/finalize.md` | KB update, report, autonomie, detection proactive, IL |
| `team-protocols/gitnexus-integration.md` | Code intelligence : outils, phases, clusters, generated skills, index freshness |

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
2. Lire `team-protocols/context-loading.json` et appliquer le filtrage par mode :
   - **Toujours** : autonomy-state.json, next-run.json, quality-ratchet.json, dernier rapport exec summary
   - **Si mode dev** : error-patterns.json (unfixed only), prompt-enrichments.json (filtre par inject_when)
   - **Si mode audit/chore** : velocity-metrics.json, agent-performance.json, estimation-accuracy.json
3. Lire le template du mode: team-templates/{mode}.md
4. Lire `team-protocols/context-loading.json > community_skills` et charger les skills pertinents au mode + scope
5. git log --oneline -5 → dernier contexte
```

### Step 3 — Create Team

```
TeamCreate("musaium-{mode}-{YYYYMMDD-HHmm}")
```

### Step 4 — Create Tasks from Template (Allocation Dynamique)

Lire le template pour obtenir le **Task Graph**. Avant de creer les tasks, consulter `agent-performance.json > specializations` pour chaque agent candidat :
- Si un agent a un avgScore < 7/10 sur un type de tache (3+ runs), preferer un agent alternatif
- Si un agent a une specialisation forte (avgScore > 9.0) pour le type de tache, le privilegier
- Log le choix d'allocation dans le rapport de run

Creer les tasks :

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

Evaluer l'Error Budget (cf. `team-protocols/error-budget-gate.json`):
- Si tsc errors > 0 OU ratchet regression → forcer mode "bug", message: "Error budget depasse."
- Envoyer le resultat a la Sentinelle.

### Step 7 — Phase Loop

Pour chaque phase active du template (10 phases, cf. team-protocols/sdlc-cycle.md).
Nouvelles phases integrees: Phase 0 (COMPRENDRE), Phase 1.5 (CHALLENGER), Phase 2.5 (REGRESSION), Phase 4.5 (VIABILITE), Phase 5 (CLEANUP).

```
1. TaskUpdate(phase_task, status: "in_progress")
2. Executer la phase (cf. sdlc-cycle.md pour le detail)
3. Si phase DEV:
   a. Construire les mandats (cf. agent-mandate.md)
   b. Injecter PE + EP pertinents dans chaque mandat
   c. Injecter le Track Record de chaque agent (depuis agent-performance.json > weaknessHistory) dans le mandat
   d. Spawner les agents DEV en PARALLELE REEL:
      Agent(subagent_type: "backend-architect", team_name, run_in_background: true)
      Agent(subagent_type: "frontend-architect", team_name, run_in_background: true)
   e. Attendre completion de tous les agents
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
11. **eslint-disable INTERDIT sauf exception documentee** — cf. ci-dessous
12. **Tests DRY avec factories** — jamais de creation d'entites inline, toujours via `tests/helpers/`

## REGLE ESLINT-DISABLE (OBLIGATOIRE POUR TOUS LES AGENTS)

**Principe : si ESLint l'interdit, c'est qu'il y a une autre maniere de faire. Cherche-la.**

### Arbre de decision (AVANT tout eslint-disable)

```
1. LIRE la doc ESLint de la regle → comprendre POURQUOI elle existe
2. REFACTORER le code pour satisfaire la regle :
   - max-lines-per-function → extraire des helpers
   - complexity → decomposer en sous-fonctions
   - max-params → options object pattern
   - react/display-name → memo(function Name() {})
   - no-misused-promises → void wrapper
   - no-explicit-any → unknown + type guard
   - prefer-optional-chain → foo?.bar
   - max-lines (fichier) → splitter en modules
3. SEULEMENT si faux positif avere (trust boundary, pattern RN, interface async) :
   - Ajouter eslint-disable-next-line avec `-- raison precise`
   - La raison doit expliquer POURQUOI c'est un faux positif, pas juste repeter le nom de la regle
```

### Categories autorisees (allowlist)

| Regle | Contexte autorise | Exemple |
|-------|-------------------|---------|
| `prefer-nullish-coalescing` | Traitement intentionnel de `""` comme falsy | `role \|\| 'visitor'` |
| `no-unnecessary-condition` | Frontiere de confiance (JWT, DB row, API externe) | `payload.type !== 'access'` apres `as` cast |
| `require-await` | Implementation no-op d'interface async | `NoopCacheService.get()` |
| `no-unnecessary-type-parameters` | Generic API pour inference des callers | `CacheService.set<T>()` |
| `no-require-imports` | Pattern React Native `require()` ou chargement conditionnel OTel | `require('./image.png')` |
| `no-control-regex` | Sanitisation input | Regex control chars dans `input.ts` |
| `sonarjs/hashing` | Checksum non-crypto (S3 Content-MD5) | `crypto.createHash('md5')` |
| `sonarjs/pseudo-random` | Jitter/backoff, pas securite | `Math.random()` pour retry |

**Tout autre `eslint-disable` = ECHEC de review. L'agent doit trouver la solution propre.**

### Injection dans les mandats agents

Chaque mandat DEV (backend-architect, frontend-architect) DOIT inclure :

```
REGLE ESLINT ABSOLUE: Tu ne dois JAMAIS ajouter de `eslint-disable` sauf pour les
categories autorisees dans CLAUDE.md § "ESLint Discipline > Justified disable patterns".
Si ESLint signale un probleme, tu DOIS refactorer le code pour satisfaire la regle.
Cherche la doc, cherche l'alternative, change ta maniere de penser.

REGLE TESTS DRY: Tu ne dois JAMAIS creer d'entites de test inline (as User, as ChatMessage, etc.).
Utilise TOUJOURS les factories partagees de tests/helpers/ :
- makeUser(overrides?) depuis tests/helpers/auth/user.fixtures.ts
- makeMessage(overrides?) depuis tests/helpers/chat/message.fixtures.ts
- makeSession(overrides?) depuis tests/helpers/chat/message.fixtures.ts
- makeToken(overrides?) depuis tests/helpers/auth/token.helpers.ts
Si une factory n'existe pas pour ton entite, cree-la dans tests/helpers/<module>/<entity>.fixtures.ts AVANT d'ecrire les tests.
Chaque factory suit le pattern: valeurs par defaut sensees + overrides partiels.
```

### Verification Sentinelle

La Sentinelle DOIT verifier a chaque porte :
```bash
git diff --cached -U0 | grep -c 'eslint-disable'
```
Si nouveaux `eslint-disable` detectes hors allowlist → **FAIL automatique** avec demande de correction.

---

## SKILLS COMPLEMENTAIRES

### Skills Internes
- **/recap** — Recap quotidien (lecture seule)
- **/security-scan** — Audit securite leger
- **/test-writer** — Generateur de tests
- **/verify-schema** — Audit schema TypeORM
- **/test-routes** — Validation endpoints API
- **/rollback** — Rollback atomique

### GitNexus — Code Intelligence
- **gitnexus-exploring** — Naviguer le code via le knowledge graph
- **gitnexus-debugging** — Tracer les bugs via les call chains
- **gitnexus-impact-analysis** — Blast radius avant modification
- **gitnexus-refactoring** — Rename/extract/split coordonnes via le graph
- **gitnexus-cli** — Index, status, clean, wiki, analyze --skills
- **gitnexus-guide** — Reference outils, ressources, schema
- **Generated cluster skills** — `.claude/skills/generated/*.md` (auto-genere par `analyze --skills`)

### Skills Communautaires — Tier 1 (HIGH VALUE)
- **/langchain-fundamentals** + **/langchain-rag** + **/langchain-middleware** — 3 skills LangChain → Backend Architect (scope chat/LLM)
- **/skill-creator** — Meta-skill amelioration → Tech Lead uniquement
- **/semgrep** (Trail of Bits) — SAST rapide → Phase VERIFIER (toujours)
- **/codeql** (Trail of Bits) — Analyse semantique → Phase VERIFIER (security-sensitive)
- **/supply-chain-auditor** (Trail of Bits) — Audit deps → si package.json modifie
- **/variant-analysis** (Trail of Bits) — Recherche variants → post-finding SAST
- **verification-before-completion** (obra/superpowers) — Discipline verification → toutes phases pre-completion

### Skills Communautaires — Tier 2 (MODERATE VALUE)
- **/pentest-checklist** — Methodologie pentest → Audit securite
- **/security-compliance** — SOC2/GDPR/ISO → Audit compliance
- **/vulnerability-scanner** — OWASP scanning → Phase VERIFIER
- **/browser-use** — Automation navigateur → Phase TESTER (museum-web)
- **/backend-patterns** — Patterns Express/TypeORM → Phase DEV (backend)

---

## SKILL COMPOSABILITY (COMPOSE)

Le Tech Lead peut chainer des skills avant/dans un run via la directive COMPOSE.

### Syntaxe

```
/team compose:skill1,skill2 [mode] [description]
```

### Exemples

```
/team compose:recap,feature "ajouter pagination"
  → Execute /recap d'abord, extrait les metriques cles, puis demarre /team feature avec le contexte recap

/team compose:verify-schema,feature-backend "nouveau endpoint users"
  → Execute /verify-schema d'abord, detecte l'etat DB, puis demarre /team feature-backend avec le contexte schema

/team compose:security-scan "apres deploy"
  → Execute /security-scan standalone sur les fichiers modifies

/team compose:semgrep,security-scan "audit securite post-deploy"
  → Execute semgrep SAST, puis /security-scan, consolide les findings

/team compose:semgrep,vulnerability-scanner,security-scan "audit OWASP complet"
  → Triple scan: OWASP patterns + semgrep + security-scan leger

/team compose:supply-chain-auditor,feature-backend "ajout nouvelle lib"
  → Audit des deps d'abord, puis /team feature-backend

/team compose:pentest-checklist,semgrep,codeql,security-compliance "audit securite full"
  → Full security audit: pentest methodology + SAST + compliance

/team compose:gitnexus-impact-analysis,refactor "rename authService → authenticationService"
  → Execute impact analysis d'abord, identifie tous les callers, puis refactor coordonne

/team compose:gitnexus-exploring,feature-backend "comprendre le pipeline chat avant d'ajouter streaming"
  → Explore le knowledge graph, trace les execution flows, puis feature avec contexte
```

### Contrats Input/Output

Chaque skill doit declarer son output dans un format consommable :

| Skill | Output JSON |
|-------|------------|
| /recap | `{date, commits, testState, deltas, attentionPoints}` |
| /security-scan | `{findings[], summary, verdict}` |
| /verify-schema | `{entities, migrations, drift, recommendation}` |
| /test-writer | `{testsGenerated, coverageDelta, report}` |
| /test-routes | `{routesTested, passed, failed, coverage}` |
| /semgrep | `{rules[], findings[], summary, verdict}` |
| /codeql | `{queries[], findings[], dataFlows[], verdict}` |
| /vulnerability-scanner | `{owaspFindings[], summary, verdict}` |
| /supply-chain-auditor | `{dependencies[], vulnerabilities[], verdict}` |
| /browser-use | `{pages[], screenshots[], assertions[], verdict}` |
| /pentest-checklist | `{categories[], checked[], findings[], verdict}` |
| /security-compliance | `{framework, controls[], gaps[], verdict}` |
| gitnexus-impact-analysis | `{target, direction, depth, dependants[], risk, processes[]}` |
| gitnexus-exploring | `{query, processes[], symbols[], clusters[]}` |

### Execution

1. Le Tech Lead execute chaque skill dans l'ordre
2. Le output JSON de chaque skill est injecte dans le contexte du skill suivant
3. Le dernier skill (ou /team mode) recoit le contexte cumule
4. Si un skill echoue (FAIL), le pipeline COMPOSE s'arrete et rapporte l'erreur
