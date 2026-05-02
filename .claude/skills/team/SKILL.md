---
description: 'SDLC multi-agents Musaium — orchestrateur enterprise-grade avec Agent Teams natifs, parallelisme reel, quality gates automatises, user feedback rules, etat durable v12'
argument-hint: '[type?:feature|bug|mockup|refactor|hotfix|chore|audit] [description] | resume:<run-id>'
---

# /team v12 — Orchestrateur SDLC Musaium

> **Reference unique** : `team-sdlc-index.md` pour la table de verite (pipelines, agents, protocoles, templates, UFR, gates, skills).
> **Architecture v12** : `docs/plans/TEAM_V12_RESEARCH_REPORT.md`.

Dispatcher avec etat durable (`team-state/<run-id>/`), Spec Kit (spec → design → tasks), handoffs structures (≤200 tokens), hooks deterministes (lint/tsc), telemetry Langfuse, modeles all-Opus.

---

## REGLES ABSOLUES

1. NE JAMAIS avancer sans gates PASS du pipeline
2. Tous agents en `model: opus-4.7` (architect, reviewer) ou `opus-4.6` (editor, verifier, security, documenter) — UFR-010 + V12 all-Opus
3. Agents ne commitent PAS — seul le Tech Lead git add/commit/push
4. Agents n'ecrivent PAS dans `team-knowledge/` ni `team-reports/`
5. Agents respectent les 13 UFR (`shared/user-feedback-rules.json`)
6. Cap 2 boucles correctives → escalade utilisateur (V12 §8)
7. Etat durable obligatoire : tout run cree `team-state/<run-id>/state.json`
8. Handoffs entre agents = JSON ≤200 tokens (briefs, refs > inline content)
9. Pas de critic-agent pour lint/tsc/tests : delegue aux hooks `team-hooks/`
10. Sentinelle = role `verifier` (DoD machine-verified, scope-boundary, spot-check, anti-hallucination) + role `reviewer` (fresh-context semantic review). Process-auditor v4 fusionne dans verifier.
11. **Honnetete absolue (UFR-013) :** interdit de mentir, fabriquer, pretendre avoir verifie sans verifier, masquer un echec. En cas de doute → WebSearch / WebFetch / Read le code reel AVANT de repondre. "Je ne sais pas" est une reponse valide. Toute regression / test failure / erreur DOIT etre rapportee verbatim, sans minimisation.

---

## EXECUTION

### Step 0 — Init or Resume

**Disambiguation rule (BLOCK on ambiguity) :**
- `$1` matches strict regex `^resume:[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+$` → RESUME mode. Run ID = `${1#resume:}`.
- Anything else (including the English word "resume" inside a description like `feature resume the auth flow`) → INIT mode.

The literal `resume:` prefix prevents collision with English prose. Refuse `resume` alone (no colon, no id) — ask the user which run.

Si RESUME :
```
1. Read team-state/<run-id>/state.json
2. Replay context from STORY.md (read-only)
3. Jump to currentStep
4. Continue avec le role d'agent attendu pour cette phase
```

Si INIT :
```
1. Generer RUN_ID = YYYY-MM-DD-<slug>
2. mkdir team-state/$RUN_ID/ et team-state/$RUN_ID/handoffs/
3. cp team-templates/STORY.md.tmpl       → team-state/$RUN_ID/STORY.md
4. Capturer .startCommit = git rev-parse HEAD
5. Write state.json initial (version: 1, status: "initializing", startCommit)
6. Set RUN_ID env pour tous les hooks/agents downstream
7. Pruning : supprimer team-state/<run-id>/ dont updatedAt > 30 jours
```

### Step 1 — Parse & Classify

```
1. Extraire mode (explicite ou infere) : feature|bug|mockup|refactor|hotfix|chore|audit
2. Extraire description
3. Determiner scope : backend-only | frontend-only | full-stack | infra
4. Si ambiguite → demander a l'utilisateur (BLOCK le run)
```

### Step 2 — Select Pipeline

Lire `team-protocols/sdlc-pipelines.md`. Classification automatique :
```
micro:      ≤5 fichiers ET ≤200 lignes ET single-scope
standard:   6-20 fichiers OU multi-scope OU interface publique modifiee
enterprise: 20+ fichiers OU cross-module OU migration DB OU security-sensitive
```

### Step 3 — Smart Context Loading + Cache Warm-up

V12 §6 : SINGLE warm call avant fan-out parallele (Anthropic prompt caching, evite 5-10x cost blow-up).

| Pipeline | Fichiers charges (avec `cache_control: ephemeral`) |
|---|---|
| micro | quality-ratchet.json + error-patterns.json + micro.md |
| standard | + quality-gates.md + agent-mandate.md + import-coherence.md + prompt-enrichments.json + standard.md |
| enterprise | + tous les protocoles + tous les KB JSON + enterprise.md |

Warm-up = 1 appel Opus 4.7 sequentiel avec full prefix avant tout dispatch parallele.

### Step 4 — Spec Kit (brainstorm + plan)

Architect agent (opus-4.7) produit dans cet ordre :

```
1. team-state/$RUN_ID/spec.md   ← cp template, fill EARS-format requirements
2. team-state/$RUN_ID/design.md ← cp template, fill architecture decisions
3. team-state/$RUN_ID/tasks.md  ← cp template, atomic task list T1.1..Tn.x
```

Update state.json : `spec`, `design`, `tasks` paths + `status: "running"` + version++.
Append STORY.md sections `brainstorm` et `plan`.

### Step 5 — Implement (editor)

Editor agent (opus-4.6) consomme tasks.md top-down :
```
1. Lit handoff brief depuis team-state/$RUN_ID/handoffs/architect-to-editor.json
2. Pour chaque task T1.x..Tn.x :
   a. Edit/Write les fichiers
   b. PostToolUse hook : .claude/skills/team/team-hooks/post-edit-lint.sh (auto)
   c. Si FAIL → boucle corrective (cap 2)
3. Append STORY.md section `implement`
4. Update state.json : agents[editor].status = "completed" + version++
```

### Step 6 — Verify (verifier + hooks deterministes)

Verifier agent (opus-4.6) declenche hooks :
```
1. .claude/skills/team/team-hooks/pre-complete-verify.sh (à creer en W3)
   - pnpm test scoped (BE/FE/WEB selon scope)
   - gitnexus_detect_changes() pour scope verification
   - mutation testing si fichier banking-grade touche (Phase 4 Stryker)
2. Append STORY.md section `verify` avec verdicts
3. Si FAIL → boucle corrective ou escalade
```

### Step 7 — Security (enterprise only)

Security agent (opus-4.6, allowedTools: Read/Grep/Bash(promptfoo*,semgrep*) — pas d'Edit) :
```
1. promptfoo regression sur chat.service.ts si touche
2. Output classifier (Presidio NER) — V12 §4 P0
3. Append STORY.md section `security`
```

### Step 8 — Review (reviewer fresh context)

Reviewer agent (opus-4.7, FRESH CONTEXT obligatoire — V12 §8 anti-pattern "rubber stamp") :
```
1. Lit spec.md + design.md + diff
2. Verdict KISS/DRY/hexagonal compliance + UFR alignement
3. Append STORY.md section `review`
```

### Step 9 — Finalize (Tech Lead)

```
1. Update KB :
   - velocity-metrics.json
   - agent-roi.json
   - error-patterns.json (si nouveau pattern)
2. Tech Lead git add + commit (jamais agents)
3. Update state.json : status: "completed" + telemetry summary
4. Optional : promote run → team-reports/ archive si milestone
```

---

## TELEMETRY (V12 W1 — Langfuse)

Tous les dispatch / gate / agent doivent emit un span via `lib/trace.sh` (helper a creer en W1, voir `docs/plans/V12_W1_LANGFUSE_INTEGRATION.md`). Fail-open : si Langfuse unreachable, dispatch continue.

Metriques cles : tokens/agent, latence/phase, cost/run, corrective-loops/run, gate verdict ratio.

---

## STATE & RESUME

- Schema : `team-state/state.schema.json` (optimistic lock via `version`)
- Doc complete : `team-state/README.md`
- Resume : `/team resume <run-id>`
- Pruning : runs >30j supprimes au demarrage du dispatcher

## PROTOCOLES

| Protocole | Fichier | Charge en |
|---|---|---|
| Pipelines & phases | `team-protocols/sdlc-pipelines.md` | Toujours |
| Quality gates | `team-protocols/quality-gates.md` | Standard + Enterprise |
| Agent mandates | `team-protocols/agent-mandate.md` | Standard + Enterprise |
| Import coherence | `team-protocols/import-coherence.md` | Standard + Enterprise |
| GitNexus integration | `team-protocols/gitnexus-integration.md` | Standard + Enterprise |
| Finalize & KB | `team-protocols/finalize.md` | Standard (partiel) + Enterprise |
| Error taxonomy | `team-protocols/error-taxonomy.md` | Enterprise |
| Conflict resolution | `team-protocols/conflict-resolution.md` | Enterprise |

## TEMPLATES

| Type | Fichier |
|---|---|
| Pipeline micro | `team-templates/micro.md` |
| Pipeline standard | `team-templates/standard.md` |
| Pipeline enterprise | `team-templates/enterprise.md` |
| Spec (Spec Kit) | `team-templates/spec.md.tmpl` |
| Design (Spec Kit) | `team-templates/design.md.tmpl` |
| Tasks (Spec Kit) | `team-templates/tasks.md.tmpl` |
| Story (append-only) | `team-templates/STORY.md.tmpl` |
| Handoff brief | `team-templates/handoff-brief.json.tmpl` |

## HOOKS DETERMINISTES (V12 §1.4)

| Hook | Trigger | Role |
|---|---|---|
| `team-hooks/post-edit-lint.sh` | Apres editor task | scoped ESLint + handoff brief size gate (≤200 tokens) |
| `team-hooks/post-edit-typecheck.sh` | Apres editor task | scoped tsc --noEmit |
| `team-hooks/pre-complete-verify.sh` | Avant `status: completed` | scoped tests + STORY.md append-only check via sha256 chain |

Tous les hooks mutent `state.json` via le pattern compare-and-swap (`mkdir state.json.lock.d` atomique POSIX, recovery PID stale, timeout 3s). Pas de dependance `flock`.

## SKILL COMPOSABILITY

```
/team compose:skill1,skill2 [mode] [description]
```
Exemples : `/team compose:recap,feature "ajouter pagination"`, `/team compose:semgrep,security-scan "audit OWASP"`

## CHANGELOG

| Version | Date | Changements |
|---|---|---|
| v3 | 2026-03 | 3 pipelines, import coherence, GitNexus integration, PE scoring, agent ROI |
| v4 | 2026-04-17 | P02 Hardening : `team-sdlc-index.md` + 12 UFR + stack-context updated |
| **v12** | **2026-05-02** | Etat durable (`team-state/<run-id>/state.json`, optimistic lock CAS via mkdir). |
|   |   | Spec Kit : spec.md (EARS + NFR + glossary + stakeholders), design.md (+observability §10), tasks.md, STORY.md (append-only, sha256-chained). |
|   |   | Handoff briefs ≤200 tokens (~800 chars), enforced by `post-edit-lint.sh`. |
|   |   | Deterministic hooks : `post-edit-lint.sh`, `post-edit-typecheck.sh`, `pre-complete-verify.sh`. |
|   |   | All-Opus : architect/reviewer = 4.7, editor/verifier/security/documenter = 4.6 (UFR-010). |
|   |   | Langfuse infra (`infra/langfuse/`) + integration plan (`docs/plans/V12_W1_LANGFUSE_INTEGRATION.md`). |
|   |   | Cache warm-up sequencing avant fan-out. Resume protocol via `/team resume:<run-id>`. |

## KNOWN GAPS (W4+)

- Agent consolidation 9→6 (W4 — V12 §3 ; W3 hooks shipped 2026-05-02)
- Architect/Editor split formalise dans agent-mandate.md (W4)
- Security stack additions : Prompt-Guard-2 + Presidio + promptfoo CI (W5 — V12 §4)
- Stryker mutation gate ≥70% sur modules critiques (W6 — V12 §6)
- ast-grep + Spec Kit pilote production (W7)
- Cosign + audit_log hash-chained + Renovate pin (W8)
