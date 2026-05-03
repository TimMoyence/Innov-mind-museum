---
description: 'SDLC multi-agents Musaium — orchestrateur enterprise-grade avec Agent Teams natifs, parallelisme reel, quality gates automatises, user feedback rules, etat durable v12'
argument-hint: '[type?:feature|bug|mockup|refactor|hotfix|chore|audit] [description] | resume:<run-id>'
---

# /team v12 — Orchestrateur SDLC Musaium

> **Reference unique** : `team-sdlc-index.md` pour la table de verite (pipelines, agents, protocoles, templates, UFR, gates, skills).
> **Roadmap orchestrateur** : `docs/ROADMAP_TEAM.md` (v13 OKR cost+quality+spec-kit-mandatory).
> **Roadmap produit** : `docs/ROADMAP_PRODUCT.md` (features NOW/NEXT/LATER).

Dispatcher avec etat durable (`team-state/<run-id>/`), Spec Kit (spec → design → tasks), handoffs structures (≤200 tokens), hooks deterministes (lint/tsc), telemetry Langfuse, all-Opus sauf Documenter (Sonnet — cf. ROADMAP_TEAM T1.3).

**Roadmap consumption** : à chaque cycle, dispatcher lit `docs/ROADMAP_PRODUCT.md` + `docs/ROADMAP_TEAM.md` pour piocher l'item NOW à exécuter (auto-consolidation T1.6 en cours de wire). Au merge feature → coche `[x]` sur item correspondant. Fin de sprint → réécriture complète des 2 ROADMAPs.

---

## REGLES ABSOLUES

1. NE JAMAIS avancer sans gates PASS du pipeline
2. Tous agents en `model: opus-4.7` (architect, reviewer) ou `opus-4.6` (editor, verifier, security) ; documenter = `sonnet-4.6` (UFR-010 exception, T1.3 ROADMAP_TEAM)
3. Agents ne commitent PAS — seul le Tech Lead git add/commit/push
4. Agents n'ecrivent PAS dans `team-knowledge/` ni `team-reports/`
5. Agents respectent les 13 UFR (`shared/user-feedback-rules.json`)
6. Cap 2 boucles correctives → escalade utilisateur (V12 §8)
7. Etat durable obligatoire : tout run cree `team-state/<run-id>/state.json`
8. Handoffs entre agents = JSON ≤200 tokens (briefs, refs > inline content)
9. Pas de critic-agent pour lint/tsc/tests : delegue aux hooks `team-hooks/`
10. Sentinelle = role `verifier` (DoD machine-verified, scope-boundary, spot-check, anti-hallucination) + role `reviewer` (fresh-context semantic review). Process-auditor v4 fusionne dans verifier.
11. **Honnetete absolue (UFR-013) :** interdit de mentir, fabriquer, pretendre avoir verifie sans verifier, masquer un echec. En cas de doute → WebSearch / WebFetch / Read le code reel AVANT de repondre. "Je ne sais pas" est une reponse valide. Toute regression / test failure / erreur DOIT etre rapportee verbatim, sans minimisation.
12. **Parallélisme = READ-ONLY uniquement (V12 §1 #1) :** spawn agents en parallèle UNIQUEMENT pour audit/research/investigation (verifier, security, reviewer, architect mode "explore"). TOUS les writes (editor, documenter) sont sérialisés. Cognition Labs + Anthropic + LangGraph convergent : context collapse + race conditions sur les writes parallèles. Max 5 sub-agents read-only en parallèle (au-delà : synthesis cost > savings).
13. **Reviewer JAMAIS dans contexte editor (V12 §8) :** le reviewer DOIT être spawné via Agent tool fresh-context, jamais via SendMessage continuation. Si fuite contexte détectée → BLOCK-CONTEXT-LEAK + re-spawn.
14. **Cap 2 boucles correctives ENFORCED (V12 §8) :** `state.json.telemetry.correctiveLoops >= 2` → dispatcher STOP + escalade user. Pas de bypass. Voir Step 5 CAP MECHANISM.

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

### Step 2.5 — Cost Estimate Gate (T1.1 ROADMAP_TEAM — KR1)

Pre-run forecast obligatoire AVANT context loading. Bloque le run si l'estimation échoue.

```
1. Determiner agent list selon pipeline :
   - micro:      architect,editor (skip verifier — hooks suffisent)
   - standard:   architect,editor,verifier,reviewer
   - enterprise: architect,editor,verifier,security,reviewer,documenter
2. Determiner complexity 1..5 (heuristique : files touched / 4, clamp 1..5).
3. Run :
     EST=$(.claude/skills/team/lib/cost-estimate.sh <pipeline> <agents-csv> <complexity>)
4. Parse JSON :
     totalCostUSD = $(echo "$EST" | jq -r '.totalCostUSD')
5. Update state.json telemetry :
     estimatedTokensIn  = totalTokensIn
     estimatedTokensOut = totalTokensOut
     estimatedCostUSD   = totalCostUSD
   (CAS lock via mkdir, schéma identique aux hooks).
6. Persist EST raw output dans `team-state/$RUN_ID/cost-estimate.json` (input pour Step 9 delta).
7. Gate failure conditions :
   - Script exit ≠ 0 OU stdout vide OU totalCostUSD null/0 → REFUSE run + escalade user.
   - Override flag `--no-cost-estimate` (passé en argv) → log audit STORY.md `cost-estimate: SKIPPED (user override)` + continue.
8. Threshold check :
   - Si totalCostUSD > $20 : warn user + demander confirmation interactive AVANT continue.
   - Si totalCostUSD > $50 : refuse implicite, escalade systematique.
```

### Step 3 — Smart Context Loading + Cache Warm-up

V12 §6 : SINGLE warm call avant fan-out parallele (Anthropic prompt caching, evite 5-10x cost blow-up).

#### Fichiers chargés (cache_control: ephemeral marker à appliquer)

| Pipeline | Fichiers chargés |
|---|---|
| micro | quality-ratchet.json + error-patterns.json + micro.md |
| standard | + quality-gates.md + agent-mandate.md + import-coherence.md + prompt-enrichments.json + standard.md |
| enterprise | + tous les protocoles + tous les KB JSON + enterprise.md |

#### Warm-up protocole CONCRET (ENFORCE)

```
1. Le dispatcher charge la liste de fichiers du pipeline ci-dessus dans une SEULE
   string concaténée (ordre stable : protocoles → KB JSON → templates).
2. Il fait UN seul appel Agent (architect, opus-4.7) avec ce prefix + un prompt
   trivial : "Acknowledge cache warm. Reply: WARM-OK + token count of input."
3. Cette response s'inscrit dans le prompt cache d'Anthropic (TTL 5 min, étendu
   automatiquement par les hits suivants).
4. SEULEMENT APRÈS WARM-OK, le dispatcher peut spawner :
   - architect en parallèle (s'il y a plusieurs scopes — RARE, normalement 1)
   - verifier + security + reviewer en parallèle (read-only, V12 §1 #1)
5. Si l'utilisateur demande un run rapide (< 1 min total) → SKIP warm-up
   acceptable (bénéfice < overhead).
6. Si run > 1 min → warm-up MANDATORY. Skipping = 5-10× cost blow-up.
```

**Anti-pattern (interdit) :** spawn 3+ agents en parallèle SANS warm-up préalable. Chaque agent paie le full prefix individuellement = 3-10× overcost.

### Step 4 — Spec Kit (brainstorm + plan)

#### APC — Agentic Plan Caching (V12 §6 + arxiv 2506.14852) — CHECK FIRST

AVANT de spawner architect pour produire un plan from scratch, le dispatcher consulte le plan-cache :

```
1. Calculer fingerprint :
     FP=$(.claude/skills/team/lib/plan-cache.sh fingerprint \
            "<mode>" "<scope>" "<modules-csv>" "<problem-statement>")
2. Lookup :
     HIT=$(.claude/skills/team/lib/plan-cache.sh lookup "$FP")
3a. Si HIT non-vide ET les paths du HIT existent encore :
      - Reuse FULL : symlink ou cp les 3 fichiers (spec/design/tasks) vers
        team-state/$RUN_ID/
      - .claude/skills/team/lib/plan-cache.sh bump "$FP"
      - Spawn architect en mode "ADAPT" (pas "fresh") pour valider/ajuster
        seulement les sections variables (Glossary, Stakeholders, Open Q)
      - Économie attendue : -50% cost, -27% latency vs cold plan
3b. Si HIT vide OU paths obsolètes :
      - Spawn architect en mode "fresh" (workflow normal ci-dessous)
      - À la fin : .claude/skills/team/lib/plan-cache.sh insert "$FP" "$RUN_ID"
4. Documenter dans STORY.md `brainstorm` section :
      - "APC: HIT (parent_run_id=X, hits=Y)" OU "APC: MISS, cold plan"
```

#### Workflow architect (mode fresh)

Architect agent (opus-4.7) produit dans cet ordre :

```
1. team-state/$RUN_ID/spec.md   ← cp template, fill EARS-format requirements
2. team-state/$RUN_ID/design.md ← cp template, fill architecture decisions
3. team-state/$RUN_ID/tasks.md  ← cp template, atomic task list T1.1..Tn.x
4. team-state/$RUN_ID/handoffs/001-architect-to-editor.json (≤200 tokens)
```

Update state.json : `spec`, `design`, `tasks` paths + `status: "running"` + version++.
Append STORY.md sections `brainstorm` et `plan`.

#### Workflow architect (mode adapt — APC HIT)

Architect agent (opus-4.7, contexte chargé avec les 3 fichiers du HIT) :

```
1. Read parent spec.md / design.md / tasks.md.
2. Identifier les deltas vs la demande actuelle (Glossary terms différents,
   stakeholders différents, NFRs différents — domaine technique souvent stable).
3. Produire des PATCH files (pas full rewrite) appliqués sur les copies dans
   team-state/$RUN_ID/.
4. Update state.json + APC bump.
```

#### Step 4 closing gate — Spec Kit mandatoire (T1.4 ROADMAP_TEAM — KR2)

AVANT de passer au Step 5, le dispatcher invoque le hook qui machine-vérifie la présence + non-vacuité de spec.md / design.md / tasks.md pour les runs non-triviaux. Ferme le loophole "architect a sauté Spec Kit en silence".

```
RUN_ID=$RUN_ID \
MODE=$MODE \
DESCRIPTION="$DESCRIPTION" \
OVERRIDE_SPEC_KIT="${OVERRIDE_SPEC_KIT:-}" \
.claude/skills/team/team-hooks/pre-feature-spec-check.sh
```

Comportement :

| Cas | Verdict gate | Exit | Suite |
|---|---|---|---|
| `mode in {chore, hotfix, audit, mockup}` ET pas de force keyword | PASS (mode bypass) | 0 | Step 5 |
| Description matche keywords triviaux (`typo`, `dep[s]? bump`, `version bump`, `lockfile`, `whitespace`, `rename file only`) ET mode ∉ {feature, refactor} ET pas de force keyword | PASS (trivial bypass) | 0 | Step 5 |
| Description matche force keywords (`security`, `auth`, `migration`, `password`, `token`, `permission`, `rbac`, `oauth`, `jwt`, `crypto`, `encrypt`) ET Spec Kit incomplet | FAIL | 1 | STOP run + escalade user |
| `mode in {feature, refactor}` ET Spec Kit absent / fichier <200B / placeholders non remplis | FAIL | 1 | STOP run + escalade user |
| Spec Kit complet (3 fichiers, ≥200B chacun, headers `## ` remplis) | PASS | 0 | Step 5 |
| `OVERRIDE_SPEC_KIT=1` (CLI flag `--no-spec-kit`) | WARN | 0 | Step 5 + audit STORY.md `## override` |

**Override flag `--no-spec-kit`** : le dispatcher accepte cet argv au démarrage du run, le propage en env `OVERRIDE_SPEC_KIT=1` au hook. La gate emit verdict=WARN (pas PASS) et le hook append une section `## override — dispatcher — <ts>` à STORY.md avec la description verbatim. Le reviewer (Step 8) DOIT justifier l'override dans son section review.

**Exit 1 = STOP** : le dispatcher ne passe pas à Step 5. Update `state.json.status="blocked"` + escalade user avec le verdict du hook (verbatim, UFR-013).

Self-test du hook : `bash .claude/skills/team/team-hooks/pre-feature-spec-check.sh --self-test` → 8/8 scenarios PASS.

### Step 5 — Implement (editor)

Editor agent (opus-4.6) consomme tasks.md top-down :
```
1. Lit handoff brief depuis team-state/$RUN_ID/handoffs/001-architect-to-editor.json
2. Pour chaque task T1.x..Tn.x :
   a. Edit/Write les fichiers
   b. RUN_ID=$RUN_ID .claude/skills/team/team-hooks/post-edit-lint.sh
   c. RUN_ID=$RUN_ID .claude/skills/team/team-hooks/post-edit-typecheck.sh
   d. Si FAIL → boucle corrective (voir CAP MECHANISM ci-dessous)
3. Append STORY.md section `implement`
4. Update state.json : agents[editor].status = "completed" + version++
```

#### CAP MECHANISM — corrective loops (V12 §8 hard limit)

**Compteur** : `state.json.telemetry.correctiveLoops` (integer, schéma déjà déclaré).

**Protocole par task qui FAIL un hook** :
```
1. Read current value:
     LOOPS=$(jq -r '.telemetry.correctiveLoops // 0' team-state/$RUN_ID/state.json)
2. Increment via CAS pattern (mêmes mkdir lock que team-hooks):
     update_state '.telemetry.correctiveLoops = ($__loops + 1)' --argjson __loops "$LOOPS"
3. If LOOPS+1 >= 2 → STOP, do NOT retry. Append STORY.md:
     "## implement — editor — <ts> [LOOP-CAP REACHED]
       - Task T<id> failed at hook <name>
       - Loops used: 2 (cap)
       - Last error: <verbatim quote>
       - Verdict: ESCALATE-USER"
   Then update state.json `status: "blocked"` + `currentStep: "blocked-loop-cap"`.
   The dispatcher returns to the user with the failure quote.
4. Else (LOOPS+1 < 2) → retry the task once with the corrective fix.
```

Le dispatcher REFUSE de continuer si `correctiveLoops >= 2` détecté à n'importe quel Step. Pas de bypass.

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

Reviewer agent (opus-4.7, FRESH CONTEXT obligatoire — V12 §8 anti-pattern "rubber stamp"). Agent file : `.claude/agents/reviewer.md` (T1.2 ROADMAP_TEAM — KR3 quality unblock, mandate étendu 2026-05-03).

#### FRESH-CONTEXT ENFORCEMENT (V12 §8)

**Le dispatcher DOIT spawn le reviewer via Agent tool (nouveau process), JAMAIS via SendMessage continuation d'une session existante.** Critère de validité du spawn :

```
1. Le contexte du reviewer ne contient AUCUN message de l'editor (ni system, ni user, ni assistant).
2. Le reviewer reçoit en input UNIQUEMENT :
   - Path vers team-state/$RUN_ID/spec.md (si présent — micro pipeline peut omettre)
   - Path vers team-state/$RUN_ID/design.md (si présent)
   - Le run ID (pour git diff $startCommit..HEAD)
   - Path d'output JSON : .claude/skills/team/team-reports/$RUN_ID/code-review.json
3. Pas de résumé, pas de "voici ce que l'editor a fait" — le reviewer LIT le diff brut + spec + design from scratch.
```

**Si le reviewer détecte fuite de contexte** (système prompt mentionne editor, ou messages historiques visibles avec edits) → il REFUSE le review et émet :
```
VERDICT: BLOCK-CONTEXT-LEAK
Reason: spawn was a continuation, not fresh-context. Re-spawn via Agent tool.
```

#### Spawn (concrete dispatcher action)

```
1. mkdir -p .claude/skills/team/team-reports/$RUN_ID/

2. Le dispatcher invoque le tool Agent avec ces paramètres :
   - description: "Code review fresh-context"
   - subagent_type: general-purpose (chargé du système prompt .claude/agents/reviewer.md)
   - prompt :
       "Tu es l'agent reviewer (.claude/agents/reviewer.md). Lis ton rôle.
        Inputs :
        - RUN_ID=$RUN_ID
        - spec=team-state/$RUN_ID/spec.md (peut ne pas exister — micro)
        - design=team-state/$RUN_ID/design.md (peut ne pas exister — micro)
        - diff base = $(jq -r .startCommit team-state/$RUN_ID/state.json)
        - output JSON = .claude/skills/team/team-reports/$RUN_ID/code-review.json

        Exécute le workflow complet (incl. Musaium-specific gates : a11y / DS tokens / security grep).
        Émets le markdown au chat + écris le JSON au path donné.
        Réponse FINALE : verdict (APPROVED|CHANGES_REQUESTED|BLOCK) + path JSON."

3. Parse le retour Agent → verdict + path JSON.
4. Read le JSON → record gates ('a11y', 'designSystem', 'securityGrep', 'kissDryHexagonal') dans state.json gates[].
5. **T1.5 — KR3 quality history** : append entry à `team-state/quality-scores.json` :
     .claude/skills/team/lib/quality-scores.sh "$RUN_ID" "$JSON_PATH"
   - Persiste les 5 axes + verdict + findings count.
   - Échec script (e.g. scoresOnFiveAxes manquant dans JSON reviewer) → BLOCK + re-spawn reviewer.
6. Append section review à STORY.md (l'agent imprime la section ; le dispatcher l'écrit append-only).
```

#### Verdict gating (T1.5 — score-thresholded)

Le verdict prioritaire est le `weightedMean` des 5 axes (T1.5 KR3) — l'agent calcule, le dispatcher applique :

| weightedMean      | Verdict           | Action                                                           |
|-------------------|-------------------|------------------------------------------------------------------|
| ≥ 85              | APPROVED          | Step 9 finalize                                                   |
| 70.0 — 84.9       | CHANGES_REQUESTED | re-spawn editor avec `findings.blocker` + `findings.important` ; incrémente `correctiveLoops` ; cap ≥2 → escalade |
| < 70              | BLOCK             | STOP + escalade user avec breakdown axe-par-axe                   |

**Override de cohérence** : si l'agent émet `verdict: BLOCK` (e.g. BLOCK-CONTEXT-LEAK) MAIS le mean ≥ 85, le verdict explicite agent prime (sécurité > metric). À l'inverse si mean < 70 mais verdict agent = APPROVED, le dispatcher REJECT le review et re-spawn (incohérence — UFR-013 honnêteté violation suspectée).

### Step 9 — Finalize (Tech Lead)

```
1. Update KB :
   - velocity-metrics.json
   - agent-roi.json
   - error-patterns.json (si nouveau pattern)

2. Cost delta (T1.1 ROADMAP_TEAM — KR1) :
     ACT=$(.claude/skills/team/lib/cost-aggregate.sh $RUN_ID)
     EST=$(cat .claude/skills/team/team-state/$RUN_ID/cost-estimate.json)
     .claude/skills/team/lib/cost-history.sh \
         "$RUN_ID" "$MODE" "$PIPELINE" "$EST" "$ACT"
   - Result appended to `.claude/skills/team/team-state/cost-history.json`.
   - Update state.json telemetry.{tokensTotalIn,tokensTotalOut,costUSD} from $ACT.
   - KR1 success metric : |deltaPct| ≤ 30% sur 10 runs glissants. Audit hebdo (T1.7).

3. Tech Lead git add + commit (jamais agents)
4. Update state.json : status: "completed" + telemetry summary
5. Optional : promote run → team-reports/ archive si milestone
```

---

## TELEMETRY (V12 W1 — Langfuse, shipped)

Tous les dispatch / gate / agent doivent emit un span via `lib/trace.sh`. Live infra : `infra/langfuse/`, BE wiring `museum-backend/src/shared/observability/{langfuse.client,safeTrace}.ts`. Fail-open : si Langfuse unreachable, dispatch continue.

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
|   |   | Langfuse infra (`infra/langfuse/`) + BE OTel wiring shipped (commit `be7258432`). |
|   |   | Cache warm-up sequencing avant fan-out. Resume protocol via `/team resume:<run-id>`. |

## KNOWN GAPS (W4+)

- Agent consolidation 9→6 (W4 — V12 §3 ; W3 hooks shipped 2026-05-02)
- Architect/Editor split formalise dans agent-mandate.md (W4)
- Security stack additions : Prompt-Guard-2 + Presidio + promptfoo CI (W5 — V12 §4)
- Stryker mutation gate ≥70% sur modules critiques (W6 — V12 §6)
- ast-grep + Spec Kit pilote production (W7)
- Cosign + audit_log hash-chained + Renovate pin (W8)
