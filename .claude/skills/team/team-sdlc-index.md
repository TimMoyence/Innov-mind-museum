# /team SDLC — Index de Référence (v13 UFR-022)

> **Table de vérité unique** : relie agents, pipeline 8-phase, protocoles, templates, UFR, gates, hooks, KB, skills.
> **Détail d'exécution** : [`SKILL.md`](SKILL.md) (canonique — Step 0..9, REGLES ABSOLUES).
> Créé par P02 (Team Hardening, 2026-04-17). Réécrit v13 (mode unique UFR-022, 2026-05-18).

## Pipeline (mode unique UFR-022)

**Plus de selecteur micro/standard/enterprise. Plus de modes feature/bug/mockup/refactor/hotfix/chore/audit. Plus de flux 7-phase / 13-phase.** UN seul pipeline 8-phase pour TOUTE modif code applicatif. Audit = inclus (security + verify toujours présents).

| # | Phase | Step SKILL.md | Agent (fresh-context) | Sortie clé |
|---|---|---|---|---|
| 1 | **spec** | 4a | architect #1 | `team-state/<RUN_ID>/spec.md` (EARS + NFR + glossary + stakeholders + acceptance) |
| 2 | **plan** | 4b | architect #2 (zero memory #1) | `design.md` + `tasks.md` |
| 3 | **doc-cache** | 4.5 | doc-cache ×N | `lib-docs/<lib>/PATTERNS.md` refresh + `doc-refresh-queue.json` |
| 4 | **red** | 5a | editor #1 | tests qui FAIL + `red-test-manifest.json {path: sha256}` |
| 5 | **green** | 5b | editor #2 (zero memory red, FROZEN-TEST) | code applicatif, tests verts |
| 6 | **verify** | 6 | *gate déterministe (hooks, sans agent)* | DoD machine-verified + lib-docs reference assertion (hooks) |
| 7 | **security** | 7 | security | SAST + audit + promptfoo + lib-docs auth/crypto/llm |
| 8 | **review** | 8 | reviewer (fresh-context) | verdict APPROVED / CHANGES_REQUESTED / BLOCK + JSON |
| 9 | **documenter** | 8.5 | documenter | ADR / CHANGELOG / STORY.md final |

**Exemption auto** : diff = 0 fichier code → `pre-phase-pure-doc-check.sh` écrit `pure-doc-skip.marker`, JUMP Step 9 finalize. **Reviewer rejection loop = ILLIMITÉ** (zéro cap). **Cap 2 = intra-phase hook fails uniquement** (lint/tsc/test dans la même phase éditeur).

## 6 Agents

| Agent | Rôle | Mandat | Model (doctrine) | Write scope |
|---|---|---|---|---|
| [architect](../../agents/architect.md) | architect | spec.md (#1) puis design.md + tasks.md (#2). Hexagonal + feature-driven + OpenAPI contract-first | opus-4.8 | `team-state/<RUN_ID>/*.md` |
| [editor](../../agents/editor.md) | editor | red (tests FAIL, #1) puis green (code, FROZEN-TEST, #2). BE/FE/Web/CI/migrations | claude-opus-4-8 | source code (no deploy/git push) |
| [doc-cache](../../agents/doc-cache.md) | doc-cache | fetch PUIS curate en un seul spawn : WebSearch + WebFetch 5-10 pages → snapshot + sources.json + VERSION, puis curate → `PATTERNS.md` (~200-500 lignes) | claude-opus-4-8 | `lib-docs/<lib>/` (snapshot + `PATTERNS.md`) |
| [security](../../agents/security.md) | security | OWASP LLM Top-10 + API Top-10 + SAST (semgrep/codeql/supply-chain) + promptfoo | claude-opus-4-8 | read-only |
| [reviewer](../../agents/reviewer.md) | reviewer | Fresh-context semantic review (KISS/DRY/hexagonal/spec↔impl parity/UFR/PATTERNS.md compliance) + scope-boundary vs plan + spot-check du fichier le plus risqué + DoD-confirmation + lib-docs-reference assertion | claude-opus-4-8 | read-only |
| [documenter](../../agents/documenter.md) | documenter | ADR drafts, STORY.md finalize, CHANGELOG, doc updates | claude-opus-4-8 | `docs/`, `README*.md`, `CHANGELOG.md`, `STORY.md` |

**Frontmatter** : tous les agents déclarent `model: claude-opus-4-8` (unifié 2026-05-31 ; documenter était auparavant pin 4-6). Doctrine portée par SKILL.md REGLE 2 (UFR-010 — all-Opus, aucun Sonnet).

**Élagage agents 9→6 (2026-05-31)** : `doc-fetcher` + `doc-curator` fusionnés en `doc-cache` (fetch+curate en un spawn). `verifier` retiré comme agent — ses gates déterministes (lint/tsc/test/mutation) restent dans les hooks (`pre-complete-verify.sh`, `post-edit-*`) + CI ; son jugement (scope-boundary vs plan, spot-check du fichier le plus risqué, DoD-confirmation, lib-docs-reference assertion) est absorbé par le `reviewer`. `learning-curator` retiré (0 amendement produit en 77 runs). **Process-auditor v4 (retiré antérieurement)** : DoD/scope/spot-check/anti-hallucination absorbés par le `reviewer` ; semantic review aussi dans `reviewer`. Les hooks `team-hooks/` couvrent les portes déterministes.

## 8 Protocoles (`team-protocols/`) — tous chargés (mode unique)

| Protocole | Fichier |
|---|---|
| Pipelines & phases | [`sdlc-pipelines.md`](team-protocols/sdlc-pipelines.md) |
| Quality gates | [`quality-gates.md`](team-protocols/quality-gates.md) |
| Agent mandates | [`agent-mandate.md`](team-protocols/agent-mandate.md) |
| Import coherence | [`import-coherence.md`](team-protocols/import-coherence.md) |
| GitNexus integration | [`gitnexus-integration.md`](team-protocols/gitnexus-integration.md) |
| Finalize & KB | [`finalize.md`](team-protocols/finalize.md) |
| Error taxonomy | [`error-taxonomy.md`](team-protocols/error-taxonomy.md) |
| Conflict resolution | [`conflict-resolution.md`](team-protocols/conflict-resolution.md) |

## Templates (`team-templates/`)

| Type | Fichier |
|---|---|
| Pipeline (mode unique) | [`enterprise.md`](team-templates/enterprise.md) — seul template chargé |
| Spec (Spec Kit) | [`spec.md.tmpl`](team-templates/spec.md.tmpl) |
| Design (Spec Kit) | [`design.md.tmpl`](team-templates/design.md.tmpl) |
| Tasks (Spec Kit) | [`tasks.md.tmpl`](team-templates/tasks.md.tmpl) |
| Story (append-only) | [`STORY.md.tmpl`](team-templates/STORY.md.tmpl) |
| Handoff brief | [`handoff-brief.json.tmpl`](team-templates/handoff-brief.json.tmpl) |

`micro.md` / `standard.md` / `audit.md` = legacy dead-concept (sélecteur retiré UFR-022) ; conservés non-référencés.

## 11 Hooks déterministes (`team-hooks/`)

| Hook | Trigger | Rôle |
|---|---|---|
| `post-edit-lint.sh` | Après editor task | scoped ESLint + handoff brief size gate (≤200 tokens) |
| `post-edit-typecheck.sh` | Après editor task | scoped tsc --noEmit |
| `post-edit-green-test-freeze.sh` | Après chaque edit phase Green | FROZEN-TEST : re-hash sha256 chaque test du manifest ; mismatch = exit 1 STOP |
| `pre-feature-spec-check.sh` | Fin Step 4b | Spec Kit closing gate (3 fichiers ≥200B, headers remplis ; plus de bypass keywords) |
| `pre-phase-pure-doc-check.sh` | Step 0 INIT §8 | Diff = 0 code → skip pipeline + `pure-doc-skip.marker` |
| `pre-phase-doc-freshness.sh` | Step 4.5 | Détecte libs touchées, 4-way staleness (version/14j/présence/sha256 drift), écrit `doc-refresh-queue.json` |
| `pre-phase-doc-reference-check.sh` | Step 6 Verify | Assert `libDocsConsulted[]` couvre les imports non-dev-only + hash drift |
| `pre-cycle-roadmap-load.sh` | Step 0 INIT §9 | Lit les 2 ROADMAPs, écrit `roadmap-context.json` (WARN tolerant) |
| `post-cycle-roadmap-update.sh` | Step 9 finalize | Fuzzy-match description ↔ items NOW, propose patch `[x]` (jamais auto-commit) |
| `pre-complete-verify.sh` | Avant `status: completed` | scoped tests + STORY.md append-only sha256 chain |
| `post-complete-lesson-capture.sh` | Step 9 finalize | Extrait 1 lesson → `team-knowledge/lessons/<RUN_ID>.md` (fail-open) |

Plus `lib/roadmap-rotate.sh` (`/team roadmap:rotate`, manuel). Tous mutent `state.json` via CAS (`mkdir state.json.lock.d`). Détail : [`team-hooks/README.md`](team-hooks/README.md).

## Shared Resources (`.claude/agents/shared/`)

| Ressource | Contenu |
|---|---|
| `stack-context.json` | BE/FE/Web versions + paths + commands + GitNexus |
| `operational-constraints.json` | OC-001..OC-006 BLOCK — droits/interdits agents |
| `user-feedback-rules.json` | 22 UFR (20 actifs), v2.1 |
| `discovery-protocol.json` | Protocole remontée hors-scope (anti scope-creep) |

## 22 User Feedback Rules (20 actifs)

Source : `.claude/agents/shared/user-feedback-rules.json` (v2.1, lastUpdated 2026-05-18). Encodent les memory `feedback_*`.

| ID | Règle | Severity |
|---|---|---|
| UFR-001 | Pas de "minimal fix" comme option viable | BLOCK |
| UFR-002 | Tests via factories partagées, jamais d'inline fixtures | BLOCK |
| UFR-003 | `eslint-disable` = dernier recours | WARN |
| UFR-004 | Vérifier GitNexus avant créer ; remplacer, pas empiler | BLOCK |
| UFR-005 | Verify-before-validate : croiser doc ↔ code réel | BLOCK |
| UFR-006 | Dev product-driven : tester routes, vérifier DB | WARN |
| UFR-007 | Aligner propositions avec stade de vie produit | WARN |
| UFR-008 | Autonomie L2+ = 100/100 only | BLOCK |
| ~~UFR-009~~ | *(deprecated 2026-05-15)* .env locaux gitignored ≠ vuln → `tools/sentinels/env-policy.mjs` | BLOCK |
| UFR-010 | Tous les agents `model: opus` (aucun Sonnet) | BLOCK |
| ~~UFR-011~~ | *(deprecated 2026-05-15)* iOS Pods/ committé → memory + CLAUDE.md gotcha | BLOCK |
| UFR-012 | Sentinelle écrit toujours son rapport *(process-auditor absorbé par le gate verify + reviewer)* | BLOCK |
| UFR-013 | Honnêteté absolue : pas de mensonge / fabrication / verif simulée | BLOCK |
| UFR-014 | Auto-déclaration des déviations dans chaque rapport agent | BLOCK |
| UFR-015 | Pas de feature flag par défaut pre-launch V1 | BLOCK |
| UFR-016 | Code mort supprimé dans le même commit que son remplacement | BLOCK |
| UFR-017 | Vérifier les tests avant de classer un finding "this is a bug" | BLOCK |
| UFR-018 | Placeholder hardcodé ? Grep `.env` avant supposer | BLOCK |
| UFR-019 | Pas d'estimation jours-dev solo (multi-prompt parallèle) | WARN |
| UFR-020 | BYPASS HOOK INTERDIT (`--no-verify` et toute variante) | BLOCK |
| UFR-021 | Tout écran user-facing → ≥1 Maestro flow happy-path | BLOCK |
| UFR-022 | Toute modif code → 5 phases fresh-context + frozen-test + lib-docs | BLOCK |

2 deprecated `deprecated:true` (UFR-009, UFR-011 — IDs conservés pour stabilité, enforcement déplacé). UFR-012 actif mais réfère la Sentinelle (process-auditor absorbé par le gate verify + reviewer).

## Quality Gates

Source : [`team-protocols/quality-gates.md`](team-protocols/quality-gates.md). Verdict review = `weightedMean` 5 axes : ≥85 APPROVED · 70-84.9 CHANGES_REQUESTED (re-spawn fresh, loop illimité) · <70 BLOCK. Gates `state.json.gates[]` : import-coherence, quality-ratchet, doc-freshness, a11y, designSystem, securityGrep, kissDryHexagonal, lesson-capture.

## Knowledge Base (`.claude/skills/team/team-knowledge/`)

Agents n'écrivent JAMAIS ici.

| Fichier / dossier | Purpose |
|---|---|
| `error-patterns.json` | Patterns d'erreurs + fix recipes |
| `prompt-enrichments.json` | Règles PE-* injectées dans les mandats |
| `velocity-metrics.json` | Métriques de vélocité par run |
| `agent-performance.json` | Performance/ROI par agent |
| `estimation-accuracy.json` | Suivi précision estimations (UFR-019) |
| `quality-ratchet.json` | Ratchet testCount / as-any |
| `autonomy-state.json` · `next-run.json` | État runtime |
| `lessons/` (+ `LESSONS_DIGEST.md`) | Lessons capturées (T2.1 KR4) |
| `amendments/{pending,applied,rejected}/` + `SCHEMA.md` | File amendments — **learning-curator RETIRÉ 2026-05-31** (`/team learning:review` retiré) ; dossier conservé en lecture seule |

## Observabilité

| Artefact | Localisation |
|---|---|
| Rapport reviewer / run state | `.claude/skills/team/team-reports/<RUN_ID>/` |
| KB updates | `.claude/skills/team/team-knowledge/*.json` (Step 9 finalize) |
| Telemetry spans | Langfuse via `lib/trace.sh` (`infra/langfuse/`) |
| Git commit | Tech Lead only (Step 9) — agents ne commitent jamais |
| GitNexus index | `.gitnexus/` (post-commit) |

## Skills composables

```
/team compose:skill1,skill2 "description"
```
Exemples : `/team compose:recap "ajouter pagination"` · `/team compose:semgrep,security-scan "audit OWASP"`

**Internes** : [/recap](../recap/) · [/security-scan](../security-scan/) · [/test-writer](../test-writer/) · [/verify-schema](../verify-schema/) · [/test-routes](../test-routes/) · [/rollback](../rollback/)

**GitNexus** : gitnexus-exploring · gitnexus-debugging · gitnexus-impact-analysis · gitnexus-refactoring · gitnexus-cli · gitnexus-guide

**Sécurité / qualité** : semgrep · codeql · supply-chain-auditor · variant-analysis · security-compliance · skill-creator · backend-patterns

(Skills retirés purgés de l'index : langchain-fundamentals/rag/middleware, pentest-checklist, vulnerability-scanner, browser-use, gitnexus-pr-review — n'existent plus dans `.claude/skills/`.)

## Autonomie

| Niveau | Requis | Description |
|---|---|---|
| L1 | Aucun | Tech Lead valide chaque phase |
| L2 | Score = 100/100 | Validation finale seulement (UFR-008) |
| L3 | **INTERDIT** | Ne pas utiliser |

## Subcommands

`resume:<run-id>` · `roadmap:rotate` · `compose:<skills>`. Détail : SKILL.md Step 0. *(`learning:review` retiré 2026-05-31 avec le learning-curator.)*

## Changelog

| Version | Date | Changements |
|---|---|---|
| v3 | 2026-03 | 3 pipelines, import coherence, GitNexus integration, PE scoring, agent ROI |
| v4 | 2026-04-17 | P02 hardening : `team-sdlc-index.md` + 12 UFR + stack-context RN 0.83/Expo 55 |
| v12 | 2026-05-02 | État durable `state.json` (CAS), Spec Kit, handoff briefs ≤200 tokens, hooks déterministes, all-Opus, Langfuse, cache warm-up. 6 agents (architect/editor split, process-auditor fusionné) |
| v13 | 2026-05-03 | T1.6 ROADMAP × /team (load/update/rotate hooks) ; T2.1 feedback-loop (lesson-capture hook + learning-curator + `/team learning:review`) |
| **v13.UFR-022** | **2026-05-18** | **MODE UNIQUE.** Sélecteur pipeline + modes retirés. Pipeline 9-phase fixe. Step 4 split spec/plan ; Step 5 split red/green (FROZEN-TEST). Nouveau Step 4.5 doc-freshness (doc-fetcher + doc-curator → cache `lib-docs/`). Security + documenter toujours présents. Reviewer loop illimité ; cap 2 = intra-phase only. 4 nouveaux hooks (pure-doc/freshness/freeze/reference). 9 agents. 22 UFR (20 actifs). APC retiré. Cost gate = telemetry only |
| **v13 index** | **2026-05-20** | Réécriture index : 6→9 agents, 12→22 UFR, suppression pipelines/modes/flux 7-13-phase, KB path corrigé `→ .claude/skills/team/team-knowledge/`, 11 hooks indexés, 8 skills morts purgés, templates UFR-022 ajoutés |
| **v13.prune-9→6** | **2026-05-31** | Élagage agents 9→6. `doc-fetcher`+`doc-curator` → `doc-cache` (fetch+curate un spawn). `verifier` retiré : gates déterministes dans hooks+CI, jugement absorbé par `reviewer`. `learning-curator` + `/team learning:review` retirés (0 amendement en 77 runs ; `team-knowledge/lessons/` lecture seule). Phase `verify` devient gate déterministe sans agent. Pipeline 8-phase (spec→plan→doc-cache→red→green→verify[gate]→security→review→documenter). `security` conservé |
