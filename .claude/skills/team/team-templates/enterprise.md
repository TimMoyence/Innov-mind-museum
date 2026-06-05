# Template: Pipeline (mode unique UFR-022)

Pipeline unique fresh-context pour TOUTE modification de code applicatif + tests.

> **Plus de selecteur micro/standard/enterprise** — un seul pipeline, 8 phases obligatoires.
> Exemption auto uniquement si `git diff` = 0 fichier code (pure-doc edit, detecte par `pre-phase-pure-doc-check.sh`).
> Ce template est chargé en warm-up cache prefix (SKILL.md Step 3 §135). Il mirror le pipeline canonique de `team-protocols/sdlc-pipelines.md` + SKILL.md Steps 4a→9.

**Contexte :** tous les protocoles + tous les KB JSON chargés (warm-up unique avant fan-out).

---

## TASK GRAPH (mode unique 8-phase)

```
P1: spec           (blockedBy: rien)              architect fresh #1
P2: plan           (blockedBy: P1)                architect fresh #2 — zero memory de P1
P3: doc-cache       (blockedBy: P2)               doc-cache fresh (×N libs stale, optionnel) — fetch PUIS curate un spawn
P4: red            (blockedBy: P3)                editor fresh #1 — tests qui FAIL + red-test-manifest.json
P5: green          (blockedBy: P4)                editor fresh #2 — zero memory de P4, FROZEN-TEST byte-for-byte
P6: verify         (blockedBy: P5)                gate hooks deterministe, pas de spawn agent
P7: security       (blockedBy: P6)                security fresh — TOUJOURS present
P8: review         (blockedBy: P7)                reviewer fresh — rejection loop ILLIMITE
P9: documenter     (blockedBy: P8)                documenter fresh — TOUJOURS present
```

## PHASES

### P1 — spec (architect fresh spawn #1)

```
1. Read brief JSON ≤200 tokens (handoffs/001-spec.json) + roadmap-context.json + lib-docs/INDEX.json
2. Emit BRIEF-ACK: <sha256> en premiere reponse
3. Produire UNIQUEMENT spec.md (EARS + NFR + glossary + stakeholders + acceptance criteria)
4. Pas de code, pas de design.md, pas de tasks.md
5. Si fuite context d'une autre phase -> BLOCK-CONTEXT-LEAK + refuse
6. Verdict FINAL : READY-FOR-PLAN | BLOCKED-AWAITING-USER
```

### P2 — plan (architect fresh spawn #2, zero memory de P1)

```
1. Read spec.md depuis disque (handoffs/002-plan.json) — JAMAIS de resume de P1
2. BRIEF-ACK: <sha256>
3. Produire design.md (hexagonal mapping, data model, API contract, test plan, observability)
   + tasks.md (liste de taches atomiques)
4. Inclure section ## Multi-cycle progress si match multi-cycle-features trouve a INIT
```

### P3 — doc-cache (doc-cache fresh, optionnel)

```
1. Hook pre-phase-doc-freshness.sh detecte les libs non-dev-only touchees par tasks.md
2. Pour chaque lib stale (>14j OU version drift OU PATTERNS.md manquant) :
   a. doc-cache fresh : fetch PUIS curate en un seul spawn —
      WebSearch + WebFetch 5-10 pages -> snapshot-YYYY-MM-DD.md + sources.json + VERSION (untracked),
      puis curate -> PATTERNS.md ~200-500 lignes (untracked)
   b. Dispatcher update lib-docs/INDEX.json (tracked)
3. WebSearch fail -> WARN + use stale + tag rapport. JAMAIS de BLOCK.
4. Parallelisme autorise par-lib (read-only sur source, write zones disjointes)
```

### P4 — red (editor fresh spawn #1)

```
1. Read spec.md + design.md + tasks.md + lib-docs/INDEX.json (handoffs/003-red.json)
2. BRIEF-ACK: <sha256>
3. Consulter lib-docs/<lib>/PATTERNS.md + LESSONS.md pour chaque lib importee (obligation UFR-022)
4. Ecrire des tests qui FAIL (prouvent absence feature ou presence bug)
5. pnpm test scoped DOIT exit != 0 = success de la phase
6. Ecrire red-test-manifest.json {<path>: sha256} par test cree/modifie
7. Retourner JSON avec libDocsConsulted[]
```

### P5 — green (editor fresh spawn #2, zero memory de P4, FROZEN-TEST)

```
1. Read spec.md + design.md + tasks.md + red-test-manifest.json + redDiff (handoffs/004-green.json)
2. BRIEF-ACK: <sha256>
3. Consulter lib-docs/<lib>/PATTERNS.md + LESSONS.md
4. Ecrire le code applicatif (PAS les tests) jusqu'a ce que tous les tests du manifest passent
5. Apres chaque edit, les hooks tournent :
   a. post-edit-lint.sh        (scoped ESLint + brief size gate)
   b. post-edit-typecheck.sh   (scoped tsc --noEmit)
   c. post-edit-green-test-freeze.sh  ← FROZEN-TEST : mismatch sha256 = exit 1 STOP
6. FROZEN-TEST : interdiction de modifier un byte d'un test du manifest.
   Si test bugge -> emettre BLOCK-TEST-WRONG <path>:<line> <reason> SANS toucher, re-spawn fresh P4 red.
7. pnpm test scoped DOIT exit 0 (green)
8. Retourner JSON avec libDocsConsulted[]

CAP intra-phase : intraPhaseHookLoops >= 2 (lint/tsc/test fails dans la MEME phase) -> STOP + escalade user.
```

### P6 — verify (gate déterministe, hooks, sans agent)

```
Aucun spawn agent. Le dispatcher lance directement les hooks deterministes :
1. pre-complete-verify.sh : pnpm test scoped (BE/FE/WEB) + gitnexus_detect_changes() + mutation si banking-grade
2. pre-phase-doc-reference-check.sh : cross-check libDocsConsulted[] (red+green) vs imports du diff
3. post-edit-green-test-freeze.sh (defense-in-depth, FROZEN-TEST final assert)
4. Verdict gate PASS/WARN/FAIL ecrit dans state.json.gates[]. FAIL -> boucle corrective intra-phase OU re-spawn fresh la phase pointee.
5. Le jugement non-deterministe (scope-boundary vs plan, spot-check du fichier le plus risque, DoD-confirmation, lib-docs-reference assertion) est absorbe par le reviewer (P8).
```

### P7 — security (security fresh spawn, TOUJOURS present)

```
1. allowedTools : Read/Grep/Bash(promptfoo*,semgrep*) — pas d'Edit
2. pnpm audit (BE+FE+web) — supply chain CVE drift
3. semgrep --config=p/owasp-top-ten + p/llm-security si scope LLM/auth/crypto
4. promptfoo regression sur chat.service.ts si touche
5. Cross-ref lib-docs/<lib>/PATTERNS.md pour libs auth/crypto/llm
6. Verdict PASS/WARN/FAIL. FAIL CRITICAL/HIGH -> BLOCK, escalade user.
```

### P8 — review (reviewer fresh spawn, rejection loop ILLIMITE)

```
1. FRESH CONTEXT obligatoire — AUCUN message de l'editor. Spawn via Agent tool, jamais SendMessage.
2. Inputs : spec.md + design.md (paths) + RUN_ID + diff base. Pas de resume editor.
3. Citer PATTERNS.md:<line> quand le code devie d'un pattern documente -> CHANGES_REQUESTED.
4. Verdict prioritaire = weightedMean des 5 axes :
     >= 85          -> APPROVED -> P9 documenter
     70.0 — 84.9    -> CHANGES_REQUESTED -> re-spawn FRESH la phase pointee (spec/plan/red/green)
     < 70           -> BLOCK -> STOP + escalade user (breakdown axe-par-axe)
5. Reviewer rejection loop = ILLIMITE (reviewerRejectionLoops telemetry seule, zero cap, zero warning auto).
   Si reviewer rejette N fois c'est qu'il y a raison.
6. Fuite context -> VERDICT: BLOCK-CONTEXT-LEAK + re-spawn fresh.
```

### P9 — documenter (documenter fresh spawn, TOUJOURS present)

```
1. BRIEF-ACK: <sha256>
2. Append STORY.md final section (post-finalize summary)
3. ADR(s) si nouveau choix architectural irreversible
4. CHANGELOG entry si release-bound
```

### Finalize (Tech Lead — hors phases agents)

```
1. Update KB (velocity-metrics, agent-roi, error-patterns)
2. Cost delta telemetry (KR1, no block)
3. state.json status: completed + telemetry summary
4. Lesson capture (post-complete-lesson-capture.sh, fail-open)
5. Roadmap tick proposal (post-cycle-roadmap-update.sh, ASK user, jamais auto-commit)
6. Tech Lead git add + commit (jamais les agents)
```

## DoD (machine-verified)

- [ ] spec.md / design.md / tasks.md presents + non-vides (pre-feature-spec-check.sh PASS)
- [ ] red-test-manifest.json ecrit, tests FAIL prouves (P4)
- [ ] FROZEN-TEST respecte byte-for-byte (post-edit-green-test-freeze.sh PASS)
- [ ] tsc PASS (scope) + tests PASS (green, P6)
- [ ] libDocsConsulted[] couvre les imports non-dev-only (pre-phase-doc-reference-check.sh PASS)
- [ ] Security verdict PASS/WARN, pas de CRITICAL/HIGH non-resolu (P7)
- [ ] Reviewer weightedMean >= 85 (APPROVED) (P8)
- [ ] documenter pass present (STORY.md final section, P9)
- [ ] Lesson capture verdict dans state.json gates[]
- [ ] Code commite par le Tech Lead uniquement
