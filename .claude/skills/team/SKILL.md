---
description: 'SDLC multi-agents Musaium — orchestrateur enterprise-grade UNIQUE MODE (UFR-022) avec fresh-context 5-phase + frozen-test + lib-docs obligation + reviewer rejection loop illimité. Plus de selecteur de pipeline ; chaque modif code applicatif passe par spec → plan → red → green → verify → security → review → documenter.'
argument-hint: '[description] | resume:<run-id> | roadmap:rotate | learning:review | compose:<skill1,skill2>'
---

# /team v13 — Orchestrateur SDLC Musaium (mode unique UFR-022)

> **Reference unique** : `team-sdlc-index.md` pour la table de verite (agents, protocoles, templates, UFR, gates, skills).
> **Roadmap orchestrateur** : `docs/ROADMAP_TEAM.md` (v13 OKR cost+quality+UFR-022).
> **Roadmap produit** : `docs/ROADMAP_PRODUCT.md` (features NOW/NEXT/LATER).
> **UFR-022 design** : `docs/superpowers/specs/2026-05-18-ufr-022-fresh-context-five-phases-design.md`.

Dispatcher avec etat durable (`team-state/<run-id>/`), 5-phase fresh-context obligatoire (spec → plan → red → green → review), handoffs structures (≤200 tokens), hooks deterministes (lint/tsc/freshness/freeze/reference), telemetry Langfuse, all-Opus.

**Mode unique enterprise-grade (UFR-022).** Plus de selecteur micro/standard/enterprise. Plus de keywords de bypass Spec Kit. Plus de modes chore/hotfix/audit/mockup. UN seul pipeline pour toute modif code applicatif. Exemption auto si diff = 0 fichier code (pure-doc edit) detecte par `pre-phase-pure-doc-check.sh`.

**Roadmap consumption** : à chaque cycle, dispatcher lit `docs/ROADMAP_PRODUCT.md` + `docs/ROADMAP_TEAM.md` pour piocher l'item NOW à exécuter. Au merge feature → coche `[x]` sur item correspondant. Fin de sprint → réécriture complète des 2 ROADMAPs.

---

## REGLES ABSOLUES

1. NE JAMAIS avancer sans gates PASS du pipeline
2. Tous agents en `model: opus-4.7` (architect, reviewer) ou `opus-4.6` (editor, verifier, security, documenter, doc-fetcher, doc-curator) — UFR-010 sans exception
3. Agents ne commitent PAS — seul le Tech Lead git add/commit/push
4. Agents n'ecrivent PAS dans `team-knowledge/` ni `team-reports/`
5. Agents respectent les 22 UFR (`shared/user-feedback-rules.json`)
6. **UFR-022 fresh-context 5-phase obligatoire** : chaque phase (spec / plan / red / green / review) = un Agent spawn fresh, zero message d'une autre phase dans son context. `BRIEF-ACK: <sha256>` premiere reponse ; `BLOCK-CONTEXT-LEAK` si leak detecte. Verifier hook `pre-phase-doc-reference-check.sh` cross-check `libDocsConsulted[]`.
7. Etat durable obligatoire : tout run cree `team-state/<run-id>/state.json`
8. Handoffs entre agents = JSON ≤200 tokens (briefs, refs > inline content)
9. Pas de critic-agent pour lint/tsc/tests : delegue aux hooks `team-hooks/`
10. Sentinelle = role `verifier` (DoD machine-verified, scope-boundary, spot-check, anti-hallucination, lib-docs-reference assertion) + role `reviewer` (fresh-context semantic review, lib-docs PATTERNS.md compliance, frozen-test cross-check). Process-auditor v4 fusionne dans verifier.
11. **Honnetete absolue (UFR-013) :** interdit de mentir, fabriquer, pretendre avoir verifie sans verifier, masquer un echec. En cas de doute → WebSearch / WebFetch / Read le code reel AVANT de repondre. "Je ne sais pas" est une reponse valide. Toute regression / test failure / erreur DOIT etre rapportee verbatim, sans minimisation.
12. **Parallélisme = READ-ONLY uniquement :** spawn agents en parallèle UNIQUEMENT pour audit/research/investigation read-only. TOUS les writes serialises. Max 5 sub-agents read-only en parallèle. Doc-fetcher peut paralleliser par lib (read-only sur source) ; doc-curator peut suivre, en parallele aussi (sa write zone est par-lib disjointe).
13. **Tout agent JAMAIS dans contexte d'une autre phase (UFR-022) :** spawn via Agent tool fresh-context, jamais via SendMessage continuation. Fuite detectee → BLOCK-CONTEXT-LEAK + re-spawn proprement.
14. **Cap 2 boucles correctives UFR-022-ament : intra-phase uniquement.** `state.json.telemetry.intraPhaseHookLoops >= 2` (lint/tsc/test fails dans la MEME phase editeur) → STOP + escalade user. **Reviewer rejection loop = ILLIMITE** (`state.json.telemetry.reviewerRejectionLoops` purement telemetry, zero cap, zero warning auto). Si reviewer rejette N fois c'est qu'il y a raison ; re-spawn fresh la phase pointee (spec/plan/red/green).
15. **Lib-docs obligation (UFR-022)** : agent red/green/reviewer DOIT consulter `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md` pour chaque lib non-dev-only importee par le diff. Cache stale (>14j OU version drift OU manquant) declenche doc-fetcher + doc-curator (double fresh agents). WebSearch fail → WARN + use stale + tag. Verifier hook BLOCK si `libDocsConsulted[]` ne couvre pas les imports.
16. **Frozen-test (UFR-022)** : phase Red ecrit `red-test-manifest.json` `{path: sha256}` ; phase Green ne peut pas modifier un byte d'un test du manifest. Hook `post-edit-green-test-freeze.sh` enforce. Mismatch = STOP. Si Green pense test bugge → `BLOCK-TEST-WRONG <file>:<line> <reason>` SANS toucher, re-spawn fresh phase Red.

---

## EXECUTION

### Step 0 — Init or Resume

**Disambiguation rule (BLOCK on ambiguity) :**
- `$1` matches strict regex `^resume:[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+$` → RESUME mode. Run ID = `${1#resume:}`.
- `$1` matches strict regex `^roadmap:rotate$` → ROADMAP-ROTATE mode (T1.6). Dispatcher delegates to `lib/roadmap-rotate.sh`, no architect/editor agents spawned, no Spec Kit. Optional `--sprint-end YYYY-MM-DD` appended after the prefix is forwarded as-is. Returns helper exit code as run verdict (0 ok, 2 dirty tree, 1 internal). The only currently valid `roadmap:` subcommand is `rotate`.
- `$1` matches strict regex `^learning:review$` → LEARNING-REVIEW mode (T2.1). Dispatcher walks `team-knowledge/amendments/pending/` (skipping `_curator-batch-*.md` summaries), prompts the user per amendment, applies/rejects via `git apply`. No `team-state/<run-id>/` is created. See "LEARNING SUBCOMMAND" section. The only currently valid `learning:` subcommand is `review`.
- `$1` starts with `compose:` → SKILL-COMPOSE mode (see "SKILL COMPOSABILITY" section).
- Anything else (including the English word "resume" inside a description like `feature resume the auth flow`) → INIT mode.

The literal `resume:` / `roadmap:` / `learning:` / `compose:` prefixes prevent collision with English prose. Refuse `resume` alone (no colon, no id) — ask the user which run. Refuse `roadmap:` or `learning:` without a known subcommand — list valid subcommands.

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
5. Write state.json initial (version: 1, status: "initializing", startCommit, mode: "standard", pipeline: "enterprise")
6. Set RUN_ID env pour tous les hooks/agents downstream
7. Pruning : supprimer team-state/<run-id>/ dont updatedAt > 30 jours (sauf team-state/multi-cycle-features/** qui est exempte du pruning)
8. **Pure-doc exemption check (UFR-022)** :
     RUN_ID=$RUN_ID .claude/skills/team/team-hooks/pre-phase-pure-doc-check.sh
   - Exit 0 + marker `pure-doc-skip.marker` ecrit → mode = "pure-doc-skip", JUMP directement Step 9 finalize (skip all phases 1-8).
   - Exit 0 sans marker → diff applicatif present, continuer pipeline complet.
   - Exit 1 → diff vide, BLOCK : "rien a executer, ajoute des changes au working tree".
9. Roadmap context loader (T1.6) :
     RUN_ID=$RUN_ID .claude/skills/team/team-hooks/pre-cycle-roadmap-load.sh
   - Produit team-state/$RUN_ID/roadmap-context.json (lecture-seule).
   - verdict=PASS attendu ; verdict=WARN tolere (roadmap absente → arrays vides, dispatch continue).
   - Architect peut consulter ce JSON pour cadrer le scope (non-bloquant si absent).
10. **Multi-cycle features check (UFR-022 §9)** :
     - Scan `team-state/multi-cycle-features/*/tasks-latest.md` pour un slug matching la description.
     - Si match → charger le tasks-latest.md, l'inclure dans le brief de phase=plan, et la phase=plan amendera "Cycles completed" + "Acceptance criteria".
```

### Step 1 — Parse description (UFR-022 mode unique)

```
1. Extraire description (tout l'argv apres le RUN_ID disambiguation)
2. Determiner scope : backend-only | frontend-only | full-stack | infra (informatif seulement, plus de pipeline branching)
3. Si description vide ou ambiguite extreme → demander a l'utilisateur (BLOCK le run)
```

Plus de selecteur de mode (`feature|bug|mockup|refactor|hotfix|chore|audit` retires). Plus de selecteur de pipeline (`micro|standard|enterprise` retires). Le pipeline est UNIQUE et fixe : 9 phases obligatoires (spec, plan, doc-freshness, red, green, verify, security, review, documenter). Exemption auto via Step 0 §8 pure-doc-check si diff = 0 code file.

### Step 2 — REMOVED (UFR-022 : mode unique, plus de pipeline selector)

Step 2 historique (select pipeline micro/standard/enterprise) supprime. Le pipeline est toujours le pipeline complet 9-phase.

### Step 2.5 — Cost Estimate Telemetry (T1.1 KR1 — UFR-022 amende : telemetry only, no block)

Pre-run forecast collecte pour audit hebdo KR1, **sans threshold bloquant**.

```
1. Agent list fixe (mode unique) :
   architect (×2 — spec + plan), editor (×2 — red + green), verifier, security, reviewer, documenter, doc-fetcher (×N libs stale), doc-curator (×N libs stale)
2. Determiner complexity 1..5 (heuristique : files touched / 4, clamp 1..5).
3. Run :
     EST=$(.claude/skills/team/lib/cost-estimate.sh enterprise <agents-csv> <complexity>)
4. Parse JSON :
     totalCostUSD = $(echo "$EST" | jq -r '.totalCostUSD')
5. Update state.json telemetry :
     estimatedTokensIn  = totalTokensIn
     estimatedTokensOut = totalTokensOut
     estimatedCostUSD   = totalCostUSD
   (CAS lock via mkdir, schéma identique aux hooks).
6. Persist EST raw output dans `team-state/$RUN_ID/cost-estimate.json` (input pour Step 9 delta).
7. Gate failure conditions :
   - Script exit ≠ 0 OU stdout vide OU totalCostUSD null/0 → log WARN, continue (telemetry only, UFR-022 amende).
   - Override flag `--no-cost-estimate` → log audit STORY.md `cost-estimate: SKIPPED (user override)` + continue.
8. **THRESHOLD BLOCKS RETIRES (UFR-022)** — aucun seuil $20/$50 ne bloque le run. Cost reste mesure pour audit KR1, jamais frein.
```

### Step 3 — Smart Context Loading + Cache Warm-up

V12 §6 : SINGLE warm call avant fan-out parallele (Anthropic prompt caching, evite 5-10x cost blow-up).

#### Fichiers chargés (cache_control: ephemeral marker à appliquer) — UFR-022 mode unique

Le mode unique charge TOUS les protocoles et KB JSON (équivalent ancien `enterprise`). Plus de branching par pipeline.

| Mode | Fichiers chargés |
|---|---|
| standard (mode unique UFR-022) | quality-ratchet.json + error-patterns.json + quality-gates.md + agent-mandate.md + import-coherence.md + prompt-enrichments.json + tous les protocoles + tous les KB JSON + enterprise.md template |

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

### Step 4a — Spec phase (UFR-022 fresh-context, architect spawn #1)

**Architect fresh spawn dedie a la production de spec.md UNIQUEMENT.** Pas de design.md, pas de tasks.md a cette phase.

```
1. Compose brief JSON ≤ 200 tokens dans team-state/$RUN_ID/handoffs/001-spec.json :
   {
     "from": "dispatcher",
     "to": "architect",
     "phase": "spec",
     "task": "Produce spec.md only (EARS + NFR + glossary + stakeholders + acceptance criteria) for: <description>",
     "context_refs": [
       "team-state/$RUN_ID/roadmap-context.json",
       "lib-docs/INDEX.json"
     ],
     "outputPaths": ["team-state/$RUN_ID/spec.md"]
   }
2. briefSha256 = sha256(handoff JSON file).
3. Spawn Agent tool :
   - description: "Architect phase=spec"
   - subagent_type: general-purpose (chargé du système prompt .claude/agents/architect.md)
   - prompt: "Tu es architect.md, phase=spec (UFR-022 fresh-context). Read brief at <handoff_path>. Produce ONLY spec.md at <outputPath>. Emit BRIEF-ACK: <briefSha256> in your first response. If you see another phase in history -> BLOCK-CONTEXT-LEAK + refuse. Verdict FINAL: READY-FOR-PLAN | BLOCKED-AWAITING-USER."
4. Parse agent return.
5. Append agents[] entry to state.json : {role: architect, phase: spec, freshContext: true, briefSha256, ...}.
6. Update state.json : currentStep = "spec", phaseSpawns.spec += 1.
```

### Step 4b — Plan phase (UFR-022 fresh-context, architect spawn #2)

**Architect fresh spawn #2 — ZERO memory de phase=spec.** Lit spec.md from disk, produit design.md + tasks.md.

```
1. Compose handoff 002-plan.json (≤ 200 tokens) :
   {
     "from": "dispatcher",
     "to": "architect",
     "phase": "plan",
     "task": "Read spec.md, produce design.md + tasks.md. Include ## Multi-cycle progress section if multi-cycle-features match found at INIT.",
     "context_refs": [
       "team-state/$RUN_ID/spec.md",
       "lib-docs/INDEX.json",
       "team-state/multi-cycle-features/<slug>/tasks-latest.md (if exists)"
     ],
     "outputPaths": ["team-state/$RUN_ID/design.md", "team-state/$RUN_ID/tasks.md"]
   }
2. Spawn Agent tool, NEW process, no message-history reference to phase=spec.
3. Parse output. Verify BRIEF-ACK match.
4. If `tasks.md` contains non-empty `## Multi-cycle progress` section :
   - mkdir -p team-state/multi-cycle-features/<feature-slug>/
   - cp tasks.md → team-state/multi-cycle-features/<slug>/tasks-latest.md (overwrite)
   - cp tasks.md → team-state/multi-cycle-features/<slug>/tasks-<RUN_ID>.md (snapshot)
5. Update state.json : currentStep = "plan", phaseSpawns.plan += 1.
```

### Step 4.5 — Doc Freshness + Refresh (UFR-022, optional double fresh agents)

Run AFTER plan, BEFORE red — so tasks.md is the basis for which libs the diff will touch.

```
1. Hook detection :
     RUN_ID=$RUN_ID .claude/skills/team/team-hooks/pre-phase-doc-freshness.sh
   - Parses imports in working tree + staged + untracked code files.
   - For each non-dev-only lib, 3-way check (package.json version vs INDEX vs 14d staleness vs PATTERNS.md presence).
   - Writes team-state/$RUN_ID/doc-refresh-queue.json {queue:[...], skipped:[...]}.

2. For each lib in queue[] :
   a. Spawn doc-fetcher.md FRESH (allowedTools: WebSearch+WebFetch+Read+Write lib-docs/**) :
      - Input brief: {lib, currentVersion, lastFetched, reason}
      - Workflow: WebSearch + WebFetch 5-10 pages, write snapshot-YYYY-MM-DD.md + sources.json + VERSION (all untracked)
      - Verdict: OK | WARN (WebSearch fail). NEVER BLOCK.
   b. Spawn doc-curator.md FRESH (allowedTools: Read lib-docs/**+Write lib-docs/<lib>/PATTERNS.md only) :
      - Input brief: {lib, snapshotPath, lessonsPath, sourcesPath}
      - Workflow: Read snapshot raw, extract sections, write PATTERNS.md (~200-500 lines)
      - Verdict: OK | WARN (sections missing)
   c. Dispatcher updates lib-docs/INDEX.json (single-source-of-truth, TRACKED) with the new entry :
      jq '.libs[$lib] = {version, fetched, fetchedBy, curatedAt, curatedBy, snapshotSha256, patternsSha256, sourceUrls, warnings}' INDEX.json
3. Append state.json.gates[] : {name:"doc-freshness", verdict:"PASS|WARN", details:"<N refreshed, M warnings>"}.
4. Parallelism : steps 2a + 2b can run in parallel per-lib (read-only on source ; write zones disjoint per-lib).
```

### Step 5a — Red phase (UFR-022 fresh-context, editor spawn #1)

**Editor fresh spawn dedie a la production de tests qui FAIL.** Pas de code applicatif a cette phase.

```
1. Compose handoff 003-red.json (≤ 200 tokens) :
   {
     "from": "dispatcher",
     "to": "editor",
     "phase": "red",
     "task": "Write FAILING tests proving absence of feature or presence of bug per spec.md/design.md/tasks.md. pnpm test must exit != 0 = success.",
     "context_refs": [
       "team-state/$RUN_ID/spec.md",
       "team-state/$RUN_ID/design.md",
       "team-state/$RUN_ID/tasks.md",
       "lib-docs/INDEX.json"
     ],
     "libDocsRequired": [list of libs from doc-refresh-queue.json (non-dev-only)],
     "outputPaths": ["<test-files>", "team-state/$RUN_ID/red-test-manifest.json"]
   }
2. Spawn Agent tool (editor.md, fresh).
3. Agent verifies pnpm test scoped exit != 0 (red).
4. Agent writes red-test-manifest.json {<path>: sha256} per test created/modified.
5. Agent returns JSON with libDocsConsulted[].
6. Update state.json : phaseSpawns.red += 1, append agents[].
```

### Step 5b — Green phase (UFR-022 fresh-context, editor spawn #2 — FROZEN-TEST)

**Editor fresh spawn #2 — ZERO memory of phase=red, FROZEN-TEST byte-for-byte.**

```
1. Compose handoff 004-green.json (≤ 200 tokens) :
   {
     "from": "dispatcher",
     "to": "editor",
     "phase": "green",
     "task": "Write applicative code until all tests in red-test-manifest.json pass. FROZEN-TEST: cannot modify any byte of any path in the manifest. If test wrong: BLOCK-TEST-WRONG <path>:<line> <reason> + refuse to touch.",
     "context_refs": [
       "team-state/$RUN_ID/spec.md",
       "team-state/$RUN_ID/design.md",
       "team-state/$RUN_ID/tasks.md",
       "team-state/$RUN_ID/red-test-manifest.json",
       "lib-docs/INDEX.json"
     ],
     "redDiffPath": "<git diff $startCommit..HEAD as of end of red phase>",
     "libDocsRequired": [...same list as red...]
   }
2. Spawn Agent tool (editor.md, fresh, zero memory of red).
3. Per task in tasks.md :
   a. Edit/Write code (NOT tests).
   b. RUN_ID=$RUN_ID .claude/skills/team/team-hooks/post-edit-lint.sh
   c. RUN_ID=$RUN_ID .claude/skills/team/team-hooks/post-edit-typecheck.sh
   d. RUN_ID=$RUN_ID .claude/skills/team/team-hooks/post-edit-green-test-freeze.sh  ← FROZEN-TEST gate
   e. Si fail lint/tsc/test (intra-phase) → CAP MECHANISM intra-phase ci-dessous.
   f. Si fail freeze → STOP + escalade (cannot retry, cause = green agent touched a frozen test).
4. Agent runs pnpm test scoped → must exit 0 (green).
5. Agent returns JSON with libDocsConsulted[].
6. Update state.json : phaseSpawns.green += 1, append agents[].
```

**BLOCK-TEST-WRONG protocol** : si phase=green agent declare un test bugge :
```
1. Parse BLOCK-TEST-WRONG <test-path>:<line> <reason> from agent output.
2. Update state.json.status = "blocked-test-wrong", record finding in STORY.md.
3. Re-spawn fresh phase=red with brief :
   {
     "task": "Fix red test per editor-green finding: <reason>",
     "context_refs": [...],
     "previousRedManifest": "team-state/$RUN_ID/red-test-manifest.json (overwrite with new sha256s after fix)"
   }
4. Once new red phase complete, re-spawn fresh phase=green.
5. reviewerRejectionLoops NOT incremented (this isn't a reviewer rejection). phaseSpawns.red and phaseSpawns.green both increment.
```

#### CAP MECHANISM — intra-phase hook fails (UFR-022 amended V12 §8)

**Compteur** : `state.json.telemetry.intraPhaseHookLoops` (integer, schéma 2.1).

S'applique UNIQUEMENT aux fails de hooks `post-edit-lint.sh` / `post-edit-typecheck.sh` / `pnpm test` à l'intérieur d'une MEME phase éditeur (red OU green). Reset à 0 entre phases.

**Protocole par task qui FAIL un hook intra-phase** :
```
1. Read current value:
     LOOPS=$(jq -r '.telemetry.intraPhaseHookLoops // 0' team-state/$RUN_ID/state.json)
2. Increment via CAS pattern :
     update_state '.telemetry.intraPhaseHookLoops = ($__loops + 1)'
3. If LOOPS+1 >= 2 → STOP, do NOT retry. Append STORY.md :
     "## <phase> — editor — <ts> [INTRA-PHASE LOOP-CAP REACHED]
       - Task T<id> failed at hook <name>
       - Loops used: 2 (cap)
       - Last error: <verbatim quote>
       - Verdict: ESCALATE-USER"
   Update state.json `status: "blocked"` + `currentStep: "blocked-loop-cap"`.
   Return to user with failure quote.
4. Else (LOOPS+1 < 2) → retry the task once with corrective fix.
```

**Reviewer rejection loop (Step 8) reste ILLIMITE** — c'est un mecanisme distinct, voir Step 8.

#### Spec Kit closing gate (UFR-022 amend — keywords bypass retires)

AVANT de passer au Step 4.5 / 5a, le dispatcher invoque le hook qui machine-vérifie la présence + non-vacuité de spec.md / design.md / tasks.md.

```
RUN_ID=$RUN_ID \
DESCRIPTION="$DESCRIPTION" \
.claude/skills/team/team-hooks/pre-feature-spec-check.sh
```

Comportement (UFR-022 simplifie — plus de bypass keywords) :

| Cas | Verdict gate | Exit | Suite |
|---|---|---|---|
| Spec Kit complet (3 fichiers, ≥200B chacun, headers `## ` remplis) | PASS | 0 | Step 4.5 |
| Spec Kit absent / fichier <200B / placeholders non remplis | FAIL | 1 | STOP run + escalade user |

**Plus de mode-bypass** (chore/hotfix/audit/mockup retires). **Plus de keyword-bypass** (typo, dep bump, etc.). Le pure-doc-check au Step 0 §8 gere l'exemption automatique pour diff = 0 code. Tout autre run = Spec Kit obligatoire.

Self-test du hook : `bash .claude/skills/team/team-hooks/pre-feature-spec-check.sh --self-test` → 8/8 scenarios PASS.

### Step 6 — Verify (verifier fresh + hooks deterministes)

Verifier agent (opus-4.6, **fresh spawn UFR-022**) declenche hooks :
```
1. Spawn Agent tool verifier.md FRESH (BRIEF-ACK + BLOCK-CONTEXT-LEAK self-defense).
2. Agent runs :
   a. .claude/skills/team/team-hooks/pre-complete-verify.sh
      - pnpm test scoped (BE/FE/WEB selon scope)
      - gitnexus_detect_changes() pour scope verification
      - mutation testing si fichier banking-grade touche (Phase 4 Stryker)
   b. .claude/skills/team/team-hooks/pre-phase-doc-reference-check.sh  ← UFR-022 lib-docs assertion
      - Cross-check libDocsConsulted[] from red+green agents vs diff imports.
      - Exit 1 = FAIL = re-spawn the offending phase fresh.
   c. .claude/skills/team/team-hooks/post-edit-green-test-freeze.sh (defense-in-depth) ← FROZEN-TEST final assert
3. Append STORY.md section `verify` avec verdicts.
4. Si FAIL → boucle corrective intra-phase OU re-spawn fresh la phase pointee.
5. Update state.json : phaseSpawns.verify += 1.
```

### Step 7 — Security (TOUJOURS execute en mode unique UFR-022)

Security agent (opus-4.6, **fresh spawn UFR-022**, allowedTools: Read/Grep/Bash(promptfoo*,semgrep*) — pas d'Edit) :
```
1. Spawn Agent tool security.md FRESH.
2. Agent runs :
   - pnpm audit (BE+FE+web) — supply chain CVE drift
   - semgrep --config=p/owasp-top-ten + p/llm-security si scope touche LLM/auth/crypto
   - promptfoo regression sur chat.service.ts si touche
   - Cross-ref lib-docs/<lib>/PATTERNS.md pour libs auth/crypto/llm
3. Append STORY.md section `security`.
4. Verdict PASS/WARN/FAIL → si FAIL CRITICAL ou HIGH → BLOCK, escalade user.
5. Update state.json : phaseSpawns.security += 1.
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

#### Verdict gating (T1.5 — score-thresholded — UFR-022 amend : reviewer loop illimite)

Le verdict prioritaire est le `weightedMean` des 5 axes (T1.5 KR3) — l'agent calcule, le dispatcher applique :

| weightedMean      | Verdict           | Action                                                           |
|-------------------|-------------------|------------------------------------------------------------------|
| ≥ 85              | APPROVED          | Step 8.5 documenter                                              |
| 70.0 — 84.9       | CHANGES_REQUESTED | re-spawn FRESH la phase pointee par `reSpawnPhase` du JSON reviewer (spec/plan/red/green) ; incremente `reviewerRejectionLoops` (telemetry seule, **PAS de cap, PAS de warning auto**). |
| < 70              | BLOCK             | STOP + escalade user avec breakdown axe-par-axe                  |

**UFR-022 — reviewer rejection loop ILLIMITE.** Le compteur `state.json.telemetry.reviewerRejectionLoops` incremente a chaque CHANGES_REQUESTED. Aucun seuil n'est applique, aucun warning n'est emis. Si reviewer rejette 20 fois c'est qu'il y a raison.

Re-spawn protocol :
```
1. Read reviewer JSON output: reSpawnPhase, reSpawnReason.
2. Append handoff brief 00X-respawn.json with reSpawnReason as task.
3. Spawn fresh Agent tool of the role for that phase (architect-spec/architect-plan/editor-red/editor-green).
4. After phase completes, re-run downstream phases (e.g. green if reSpawnPhase=red, verify+security+review if reSpawnPhase=green).
5. reviewerRejectionLoops += 1 (telemetry).
6. NO cap check, NO warning surface to user, NO auto-block.
```

**Override de cohérence** : si l'agent émet `verdict: BLOCK` (e.g. BLOCK-CONTEXT-LEAK) MAIS le mean ≥ 85, le verdict explicite agent prime (sécurité > metric). À l'inverse si mean < 70 mais verdict agent = APPROVED, le dispatcher REJECT le review et re-spawn (incohérence — UFR-013 honnêteté violation suspectée).

### Step 8.5 — Documenter (UFR-022 fresh spawn, toujours present en mode unique)

Documenter agent (opus-4.6, **fresh spawn UFR-022**) :
```
1. Spawn Agent tool documenter.md FRESH.
2. Append STORY.md final section (post-finalize summary).
3. ADR(s) si nouveau choix architectural irreversible.
4. CHANGELOG entry si release-bound.
5. Update state.json : phaseSpawns.documenter += 1.
```

Plus de skip "enterprise only" (en mode unique tout run a un documenter pass — meme leger).

### Step 9 — Finalize (Tech Lead)

**Pure-doc skip fastpath (UFR-022)** : si `team-state/$RUN_ID/pure-doc-skip.marker` existe (Step 0 §8 a detecte une edit pure-doc), JUMP directement au §6 git add (skip §1-§5). Le run est marque `mode: "pure-doc-skip"`, `status: "completed"`, et l'utilisateur peut commit comme d'habitude.

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

3. Update state.json : `status: "completed"` + telemetry summary (tokensTotalIn/Out, costUSD, elapsedMs) ;
   - **CRITICAL ORDERING** : status flip MUST happen here, BEFORE the lesson hook (§4) so the hook's guard `state.json.status == "completed"` is reachable. Reviewer cycle 2026-05-03 caught the inverse ordering as a BLOCKER.

4. Lesson capture (T2.1 ROADMAP_TEAM — KR4) :
     RUN_ID=$RUN_ID .claude/skills/team/team-hooks/post-complete-lesson-capture.sh
   - Fail-open: hook exit non-0 NEVER blocks finalize (R10).
   - Skips silently if state.json `.status != "completed"` (R3) — should always be `completed` because §3 already flipped it.
   - Output: `team-knowledge/lessons/<RUN_ID>.md` (timestamp-suffixed on collision per R4).
   - state.json `gates[]` gains `lesson-capture` verdict (`PASS` or `WARN`).
   - Hook reads STORY.md + state.json (read-only) ; appends `gates[]` entry ; that's its only state mutation.

5. Roadmap tick proposal (T1.6) :
     RUN_ID=$RUN_ID DESCRIPTION="$DESCRIPTION" MODE=$MODE \
         .claude/skills/team/team-hooks/post-cycle-roadmap-update.sh
   - Lit `team-state/$RUN_ID/roadmap-context.json` (produit par Step 0 §9).
   - Verdict MATCH → display patch (`team-state/$RUN_ID/roadmap-tick.patch`) + ASK user to apply (NEVER auto-commit, NEVER auto git add).
   - Verdict AMBIGUOUS → display top 5 candidates with scores ; ask user to pick one or skip.
   - Verdict NO_MATCH / SKIP / WARN → log only, no prompt.
   - Hook fail-open : non-blocking ; finalize continue même si verdict=NO_MATCH.

6. Tech Lead git add + commit (jamais agents) — includes the lesson file written at §4
7. Optional : promote run → team-reports/ archive si milestone
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
| Quality gates | `team-protocols/quality-gates.md` | Toujours |
| Agent mandates | `team-protocols/agent-mandate.md` | Toujours |
| Import coherence | `team-protocols/import-coherence.md` | Toujours |
| GitNexus integration | `team-protocols/gitnexus-integration.md` | Toujours |
| Finalize & KB | `team-protocols/finalize.md` | Toujours |
| Error taxonomy | `team-protocols/error-taxonomy.md` | Toujours |
| Conflict resolution | `team-protocols/conflict-resolution.md` | Toujours |

## TEMPLATES

| Type | Fichier |
|---|---|
| Pipeline (mode unique UFR-022) | `team-templates/enterprise.md` — seul template chargé (cf. Step 3 §135). `micro.md`/`standard.md` = legacy dead-concept, sélecteur retiré. |
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
| `team-hooks/pre-feature-spec-check.sh` | Fin Step 4b (Spec Kit closing gate) | T1.4 KR2 — vérifie spec.md/design.md/tasks.md ≥ 200B chacun (UFR-022 : plus de bypass keywords/modes) |
| `team-hooks/pre-cycle-roadmap-load.sh` | Step 0 INIT §9 | T1.6 — lit `docs/ROADMAP_PRODUCT.md` + `docs/ROADMAP_TEAM.md`, parse items NOW non cochés, écrit `team-state/$RUN_ID/roadmap-context.json`. WARN tolerant. |
| `team-hooks/pre-complete-verify.sh` | Avant `status: completed` | scoped tests + STORY.md append-only check via sha256 chain |
| `team-hooks/post-complete-lesson-capture.sh` | Step 9 (Finalize) après cost delta | T2.1 KR4 — extrait 1 lesson markdown depuis STORY.md vers `team-knowledge/lessons/<RUN_ID>.md`. Fail-open. |
| `team-hooks/post-cycle-roadmap-update.sh` | Step 9 (Finalize) après lesson capture | T1.6 — fuzzy-match DESCRIPTION ↔ items NOW, propose patch `[x]` staged (jamais auto-commit). |
| `team-hooks/pre-phase-pure-doc-check.sh` | Step 0 INIT §8 (UFR-022) | UFR-022 — diff = 0 code applicatif → skip tout pipeline + ecrit pure-doc-skip.marker. |
| `team-hooks/pre-phase-doc-freshness.sh` | Step 4.5 (UFR-022) | UFR-022 — detecte libs touchees, 3-way staleness check, ecrit doc-refresh-queue.json. |
| `team-hooks/post-edit-green-test-freeze.sh` | Apres chaque edit phase Green (UFR-022) | UFR-022 — re-hash sha256 chaque test de red-test-manifest.json ; mismatch = exit 1 STOP. |
| `team-hooks/pre-phase-doc-reference-check.sh` | Step 6 Verify (UFR-022) | UFR-022 — assert libDocsConsulted[] couvre les imports non-dev-only du diff + hash drift check. |
| `lib/roadmap-rotate.sh` | `/team roadmap:rotate` (manual) | T1.6 — fin de sprint : archive ROADMAPs courants, promote NEXT → NOW, insère NEXT — TBD vide. Refuse tree dirty (exit 2). |

Tous les hooks mutent `state.json` via le pattern compare-and-swap (`mkdir state.json.lock.d` atomique POSIX, recovery PID stale, timeout 3s). Pas de dependance `flock`.

## SKILL COMPOSABILITY

```
/team compose:skill1,skill2 [mode] [description]
```
Exemples : `/team compose:recap,feature "ajouter pagination"`, `/team compose:semgrep,security-scan "audit OWASP"`

## LEARNING SUBCOMMAND (T2.1 — KR4)

`/team learning:review` ouvre la file de revue d'amendments produits par l'agent `learning-curator` (`.claude/agents/learning-curator.md`).

### Mode dispatcher

LEARNING-REVIEW est un mode dédié (pas un run team-state). Pas de `RUN_ID` créé, pas de Spec Kit, pas de cost gate, pas d'agents architect/editor/verifier/reviewer/security spawnés. Le dispatcher exécute directement le workflow ci-dessous.

### Workflow

```
1. Le dispatcher liste les fichiers dans `.claude/skills/team/team-knowledge/amendments/pending/`,
   en excluant les summaries `_curator-batch-*.md`. Tri par `risk` ascendant (low → high)
   pour que les patches sûrs soient présentés en premier.

2. Pour chaque amendment file :
   a. Lit la frontmatter (target, risk, sourceLessons, contentHash, proposedAt) + body
      (## Rationale, ## Patch, ## Risk + rollback).
   b. Affiche au user (formaté) : risk badge, target path, source lesson IDs, le diff hunk
      complet, la rationale, la note risk + rollback.
   c. Prompt : `[a]pprove / [r]eject / [d]efer / [s]kip-all-remaining`.

3. Sur [a]pprove :
     PATCH=$(awk '/^```diff$/,/^```$/' "$AMENDMENT" | sed '1d;$d')
     printf '%s\n' "$PATCH" | git apply --check 2>&1   # dry-run validation
     printf '%s\n' "$PATCH" | git apply
   - Exit 0 → mv "$AMENDMENT" → `team-knowledge/amendments/applied/`, update frontmatter
     `status: applied`, `appliedAt: <ISO 8601 UTC>`. NE COMMIT PAS — le user fait le commit
     séparément (REGLE §3 : agents + dispatcher ne commitent jamais).
   - Exit non-0 → laisse le file en pending/, affiche le stderr de `git apply` verbatim
     au user (UFR-013 R9 honnêteté), passe au suivant.

4. Sur [r]eject : prompt rejection reason → mv vers `team-knowledge/amendments/rejected/`
   + update frontmatter `status: rejected`, `rejectedAt: <ISO>`,
   `rejectionReason: <user-input verbatim>`.

5. Sur [d]efer : laisse le file en pending/, passe au suivant.

6. Sur [s]kip-all-remaining : break loop, exit.

7. À la fin : print summary `<N> approved, <N> rejected, <N> deferred, <N> apply-failed`
   + reminder "git diff to inspect, git commit when ready".
```

### Curator invocation (V1 manuel, T2.2 ajoute cron)

L'agent `learning-curator` (`.claude/agents/learning-curator.md`, opus-4.7, read-only) doit être spawné explicitement par le user via le tool Agent :

```
description: "Aggregate lessons batch"
subagent_type: general-purpose
prompt: |
  Tu es l'agent learning-curator (.claude/agents/learning-curator.md). Lis ton rôle.
  Args :
    --since 7d          # window (default 7d)
  Working dir: $REPO_ROOT
  Suis le workflow Step 1..8. Écris les amendments dans
  .claude/skills/team/team-knowledge/amendments/pending/.
  Toujours écrire `_curator-batch-<date>.md` (D7 honesty rule).
```

V1 = manuel sur demande. T2.2 ROADMAP_TEAM ajoute cron weekly automatique.

### Garde-fous

- L'utilisateur reste seul décideur — `/team learning:review` ne peut JAMAIS auto-approve
  (cf. memory `feedback_autonomy_100_only` : autonomy L2+ requires 100/100 score).
- `git apply` opère en working tree local — ne push pas, ne commit pas, n'altère pas le remote.
- Si le file pending/ a déjà `status` ≠ `pending`, le subcommand le saute (déjà traité —
  défense en profondeur contre double-traitement).
- Le curator est read-only sur la production (`.claude/agents/`, `SKILL.md`, hooks, protocoles) ;
  il ne peut écrire QUE dans `team-knowledge/amendments/pending/`. AllowedTools exclut Edit/Write
  pour tout autre path.

## CHANGELOG

| Version | Date | Changements |
|---|---|---|
| v3 | 2026-03 | 3 pipelines, import coherence, GitNexus integration, PE scoring, agent ROI |
| v4 | 2026-04-17 | P02 Hardening : `team-sdlc-index.md` + 12 UFR + stack-context updated |
| **v13.UFR-022** | **2026-05-18** | **MODE UNIQUE.** Pipeline selector retire (micro/standard/enterprise/modes feature/bug/etc.). UN seul pipeline 9-phase pour tout modif code applicatif. Step 4 split en 4a (architect spec fresh) + 4b (architect plan fresh). Step 5 split en 5a (editor red fresh, tests qui FAIL + red-test-manifest.json sha256) + 5b (editor green fresh, FROZEN-TEST byte-for-byte). Nouveau Step 4.5 doc-freshness (doc-fetcher + doc-curator double fresh agents) avec cache lib-docs/ (INDEX.json + LESSONS.md tracked, snapshots/PATTERNS.md untracked, refresh forcee >14j ou version drift). Step 7 security toujours present (plus enterprise-only). Step 8.5 documenter toujours present. REGLE 14 amendee : cap 2 = intra-phase hook fails seulement ; reviewer rejection loop = ILLIMITE (zero cap, zero warning). REGLE 6 + 15 + 16 ajoutes (fresh-context, lib-docs obligation, frozen-test). 4 nouveaux hooks : pre-phase-pure-doc-check, pre-phase-doc-freshness, post-edit-green-test-freeze, pre-phase-doc-reference-check. 2 nouveaux agents : doc-fetcher.md, doc-curator.md. APC (Agentic Plan Caching) retire (incompatible fresh-context). Cost gate Step 2.5 telemetry only (plus de seuil bloquant). Exemption auto pure-doc edit via pre-phase-pure-doc-check.sh. |
| **v12** | **2026-05-02** | Etat durable (`team-state/<run-id>/state.json`, optimistic lock CAS via mkdir). |
|   |   | Spec Kit : spec.md (EARS + NFR + glossary + stakeholders), design.md (+observability §10), tasks.md, STORY.md (append-only, sha256-chained). |
|   |   | Handoff briefs ≤200 tokens (~800 chars), enforced by `post-edit-lint.sh`. |
|   |   | Deterministic hooks : `post-edit-lint.sh`, `post-edit-typecheck.sh`, `pre-complete-verify.sh`. |
|   |   | All-Opus : architect/reviewer = 4.7, editor/verifier/security/documenter = 4.6 (UFR-010). |
|   |   | Langfuse infra (`infra/langfuse/`) + BE OTel wiring shipped (commit `be7258432`). |
|   |   | Cache warm-up sequencing avant fan-out. Resume protocol via `/team resume:<run-id>`. |
| **v13** | **2026-05-03** | T1.6 ROADMAP × /team auto-consolidation : pre-cycle hook (Step 0 §8 charge `roadmap-context.json`), post-cycle hook (Step 9 propose tick `[x]` via patch staged), `/team roadmap:rotate` (rotation fin sprint). 3 nouveaux composants bash, 3 emplacements wirés dans SKILL.md. Cohérent UFR + règle "Tech Lead seul commite". |
|   |   | T2.1 Feedback-loop interne (KR4) : `post-complete-lesson-capture.sh` hook (fail-open, self-test 6/6) wired Step 9 §4 ; `learning-curator` agent (opus-4.7, read-only, allowedTools sans Edit/Write) ; `/team learning:review` mode dédié (Step 0 disambiguation `^learning:review$`, workflow approve/reject/defer + `git apply`). state.schema.json étendu (`learning-curator` role + `lesson-capture` gate). Knowledge dirs scaffolded `team-knowledge/{lessons,amendments/{pending,applied,rejected}}/` + 2 SCHEMA.md. Step 9 sequence reorderé (status flip §3 → lesson §4 → roadmap §5 → commit §6) — corrective loop reviewer cycle 1. |

## KNOWN GAPS (W4+)

Tous fermés au 2026-05 (vérifié 2026-05-20). Historique W4–W8 : agents formalisés (9 `.claude/agents/*.md` incl. architect/editor split + doc-fetcher/doc-curator/learning-curator), promptfoo CI (`.github/workflows/{ci-cd,llm-security}-promptfoo.yml` + `semgrep.yml`), Stryker gate (`museum-backend/stryker/` 20+ configs), ast-grep rules production (`tools/ast-grep-rules/`), Spec Kit templates canoniques (`team-templates/{spec,design,tasks}.md.tmpl`), Renovate pin (`renovate.json`, cf. PR #267). Détails phase : `docs/PHASE_HISTORY.md`.
