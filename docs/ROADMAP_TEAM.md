# Roadmap /team — Musaium

> **Vivante.** Réécrite à chaque sprint (4 semaines). Snapshots précédents = git history.
> **Sprint courant :** 2026-05-03 → 2026-06-01.
> **Horizon :** 1 mois NOW + 1 trimestre NEXT/LATER.

---

## North Star /team

**`/team` = orchestrateur SDLC self-improving, cost-aware, eval-driven, Spec-Kit-first.**

Doit produire des features de qualité prod sans micro-management humain, en restant traçable, auditable, et économiquement rationnel.

## État actuel (V12 acquis)

| Acquis | Statut |
|---|---|
| 6 agents (architect, editor, verifier, security, reviewer, documenter) | shipped |
| Architect/Editor split formal | shipped |
| Spec Kit templates (spec.md / design.md / tasks.md / STORY / handoff-brief) | shipped |
| Dispatcher + state.json schema durable | shipped |
| Hooks déterministes (post-edit-lint, post-edit-typecheck, pre-complete-verify) | shipped |
| Cap 2 corrective loops + reviewer fresh-context | shipped |
| Read-only parallelism rule (V12 §1) | shipped |
| Cache warm-up CONCRETE protocol + APC plan-cache | shipped |
| XML-structured prompts (Anthropic-trained boost) sur 6 agents | shipped |
| Langfuse observability — `safeTrace` + spans | shipped |
| UFR-013 honesty rule | shipped |
| Promptfoo CI gate (jailbreak corpus) | shipped |
| Tous-Opus (UFR-010, exception explicite Documenter→Sonnet 2026-05-03 ADR-029) | shipped |

## Ce qui manque (gap analysis user 2026-05-03)

1. Pas d'estimation coût agent **avant** lancement (token budget per agent par feature)
2. Pas de feedback-loop interne (lessons learned auto-capturées)
3. Pas d'amélioration continue (audit weekly + tuning auto)
4. Pas d'eval auto qualité output (score post-run ≥85)
5. Pas de code review fait par agent dédié (cf. superpowers:requesting-code-review style)
6. Spec Kit pas mandatoire (opt-in actuel)
7. ~~Tous-Opus = cher pour rôles non-critiques (Documenter)~~ — résolu 2026-05-03 T1.3 (Sonnet swap, ADR-029)

---

## OKR Q2-2026 (Mai-Juin)

**Objective :** /team v13 self-improving + cost-aware, prêt à orchestrer 100% du backlog produit jusqu'au launch.

| KR | Cible | Mesure |
|---|---|---|
| **KR1 — Cost predictability** | Cost-per-feature estimable AVANT run, écart estimation/réel ≤30% | Langfuse aggregation + pre-run helper |
| **KR2 — Spec Kit adoption** | ≥80% features non-triviales pilotées via Spec Kit (rejected sinon) | Dispatcher gate + audit fin sprint |
| **KR3 — Quality eval** | Auto-eval output ≥85/100 sur derniers 100 runs | Reviewer score + promptfoo regression suite |
| **KR4 — Feedback loop** | Chaque run capture ≥1 lesson dans `.claude/skills/team/team-knowledge/` | Hook post-complete |

---

## NOW — Sprint launch (2026-05-03 → 2026-06-01)

> Coche `[x]` au merge. /team auto-consolide cette roadmap fin de chaque cycle.

### T1.1 Cost estimation per agent (KR1) — ✅ done 2026-05-03

- [x] Helper `lib/cost-estimate.sh` (path : `lib/` not `team-protocols/` for consistency w/ trace.sh + plan-cache.sh) — input pipeline + agents-csv + complexity 1..5, output JSON budget per-agent + total tokens + USD
- [x] Langfuse query script `lib/cost-aggregate.sh` — query `/api/public/observations?traceId=trace-<runId>` — fail-open fallback to state.json telemetry. Note: usage selector schema may need refresh on first real Langfuse run (T1.7 audit).
- [x] Pre-run gate (SKILL.md Step 2.5) — dispatcher REFUSE run si script exit ≠ 0 OU stdout vide OU totalCostUSD null. Threshold $20 warn / $50 refuse. Override `--no-cost-estimate` audit-trailed.
- [x] Post-run delta `lib/cost-history.sh` — append `{estimated, actual, delta, deltaPct}` to `team-state/cost-history.json` (CAS lock mkdir, 200-entry truncate). Wired in SKILL.md Step 9.
- [x] state.schema.json telemetry extended — `estimatedTokensIn/Out` + `estimatedCostUSD` fields

### T1.2 Code review agent dédié (KR3) — ✅ done 2026-05-03

- [x] Agent `reviewer.md` existant (Opus 4.7, fresh context, read-only) confirmé après audit V12 — inherits former code-reviewer
- [x] Mandate étendu (2026-05-03) : a11y axe-core scan FE + design-system token compliance (no raw hex/px) + security pattern grep (dangerouslySetInnerHTML / eval / raw SQL / env leak / hardcoded secret)
- [x] Wire dans dispatcher (Step 8) : explicit Agent tool spawn fresh-context + verdict gate APPROVED/CHANGES_REQUESTED/BLOCK + corrective loops cap
- [x] Output structured : `.claude/skills/team/team-reports/<run>/code-review.json` schema défini dans reviewer.md `<output_format>`
- [x] Décision : pas de fichier `code-reviewer.md` séparé — réutiliser reviewer.md existant (lint/tsc/tests délégués aux hooks par règle V12 #9)

### T1.3 Sonnet swap Documenter (C2)

- [x] Edit `.claude/agents/documenter.md` — `model: claude-sonnet-4-6` (+ inline justification ligne 11). state.schema.json enum étendu. SKILL.md REGLES §2 cohérent.
- [x] UFR-010 amendment — `.exceptions[]` array sur UFR-010 listant explicit role `documenter` + amendedAt + ticket + rationale. ADR-029 publié.
- [ ] Verify regression — 5 runs documenter Sonnet vs Opus, compare output qualité (manuel multi-cycle, voir ADR-029 §Verification protocol)

### T1.4 Spec Kit mandatoire enforcement (KR2)

- [x] Dispatcher gate `team-hooks/pre-feature-spec-check.sh` — non-trivial run (force keywords security/auth/migration/password/token/permission/rbac/oauth/jwt/crypto/encrypt OU mode∈{feature,refactor}) sans `spec.md` + `design.md` + `tasks.md` ≥ 200B + headers remplis → REJECT (exit 1, gate verdict=FAIL, dispatcher STOP). Heuristique fichiers/lignes (>3 / >100) deferred — editor n'a pas tourné à Step 4 (cf. design.md §9 D2).
- [x] Trivial features bypass auto — modes `chore|hotfix|audit|mockup` OU keywords triviaux (`typo`, `dep[s]? bump`, `version bump`, `lockfile`, `whitespace`, `rename file only`) sur mode hors {feature,refactor} → PASS sans Spec Kit.
- [x] Override flag `--no-spec-kit` (env `OVERRIDE_SPEC_KIT=1`) réservé à user explicit — gate verdict=WARN (pas PASS) + audit trail dans `STORY.md ## override` section. Reviewer DOIT justifier dans review section.

Self-test : `bash .claude/skills/team/team-hooks/pre-feature-spec-check.sh --self-test` → 8/8 scenarios PASS. Run de référence : `team-state/2026-05-03-spec-kit-mandatory-enforcement/`.

### T1.5 Auto-eval qualité output (KR3) — ✅ done 2026-05-03

- [x] Reviewer 5-axis scoring (correctness 0.30 / security 0.25 / maintainability 0.20 / testCoverage 0.15 / docQuality 0.10) — JSON schema + workflow step + rubric + weighted-mean formula in `.claude/agents/reviewer.md` `<output_format>`
- [x] `lib/quality-scores.sh` — append reviewer JSON entry to `team-state/quality-scores.json` (mkdir-CAS lock, 200-entry truncate). Initial empty `[]`.
- [x] SKILL.md Step 8 verdict gating thresholded — ≥85 APPROVED / 70-84 CHANGES_REQUESTED / <70 BLOCK + cohérence override (verdict explicite agent prime sur metric pour BLOCK ; mean<70 + verdict APPROVED → reject + re-spawn).
- [x] Promptfoo regression — 20-feature synthetic corpus (`team-promptfoo/corpus.json`), eval shim (`lib/reviewer-eval-shim.sh`, mock + real Anthropic API modes), regression detector (`lib/quality-regression.sh`, fail >5pts drop), CI workflow `team-quality-regression.yml` (PR mock + cron weekly real). Baseline calibrated mock-bootstrap, awaits first real-mode run for re-bake.

### T1.5b Real-mode baseline rebake + bake helper

- [ ] After first Mon-04:00 UTC real Anthropic-API cron run lands, write `lib/quality-baseline-bake.sh` to derive new `baseline-scores.json` from a real-mode `output.json` (axisMeans + perFeature)
- [ ] Re-commit baseline w/ `calibrationMode: "real-anthropic-opus-4.7"` and timestamp
- [ ] Document rebake protocol in `team-promptfoo/README.md` (replace mock-bootstrap section with real-baked steps)

### T1.6 Auto-consolidation roadmap (intégration ROADMAP × /team) — ✅ done 2026-05-03

- [x] Hook `team-hooks/pre-cycle-roadmap-load.sh` — dispatcher lit `docs/ROADMAP_PRODUCT.md` + ce fichier au démarrage chaque cycle (Step 0 §8). Awk parser tracks parent `### Tx.y` H3 headers + emits `parentSection` per item. WARN-tolerant: missing roadmap → empty arrays + dispatch continues. 4/4 self-tests PASS.
- [x] Hook `team-hooks/post-cycle-roadmap-update.sh` — Step 9 §4 fuzzy-match Jaccard (id + parent + text vs DESCRIPTION tokens, threshold 0.6, gap 0.1). Verdicts MATCH (patch staged, NEVER auto-commit) / AMBIGUOUS / NO_MATCH / SKIP (chore/hotfix/audit/mockup). 4/4 self-tests PASS. Known limitation : DESCRIPTION at parent-feature level (e.g. "T1.6 ...") matches all 3 sub-items at ~0.33 → NO_MATCH ; user applies patches manually from candidates list.
- [x] Fin sprint trigger — `/team roadmap:rotate` (`lib/roadmap-rotate.sh`) archive ROADMAPs courants à `docs/archive/roadmaps/<sprint-end>/` (collide-safe `-2`/`-3`/...), promote NEXT body → NOW, insère `## NEXT — TBD` placeholder. Refuse tree dirty (exit 2). NEVER `git add`/`commit`/`push`. 4/4 self-tests PASS.

Run de référence : `team-state/2026-05-03-t1-6-roadmap-auto-consolidation/` (spec + design + tasks + STORY).

---

## NEXT — Post-launch (juin–juillet)

### T2.1 Feedback-loop interne (KR4) — ✅ pulled forward + done 2026-05-03

- [x] Hook `team-hooks/post-complete-lesson-capture.sh` — chaque run produit 1 lesson markdown dans `team-knowledge/lessons/<RUN_ID>.md`. Self-test 6/6, fail-open (R10), graceful skip si status≠completed (R3), timestamp suffix sur RUN_ID collision (R4). UFR-013 honesty : `_no data captured_` litéral si STORY.md sans signal. Wired Step 9 SKILL.md.
- [x] Aggregator manuel V1 — agent `.claude/agents/learning-curator.md` (opus-4.7, read-only, allowedTools sans Edit/Write hors `team-knowledge/`) synthétise lessons par tag + recency, produit 0..N amendments + toujours `_curator-batch-<date>.md` summary (D7 honesty rule). Cron weekly deferred → T2.2.
- [x] User review queue — `/team learning:review` mode dédié (LEARNING-REVIEW dans Step 0 disambiguation, pas de team-state run créé), workflow approve/reject/defer/skip-all + `git apply` + verbatim git error sur fail (R9). state.schema.json étendu (`learning-curator` role + `lesson-capture` gate). Knowledge dirs scaffolded : `team-knowledge/{lessons,amendments/{pending,applied,rejected}}/` + 2 SCHEMA.md docs.

Run de référence : `team-state/2026-05-03-feedback-loop-interne-t21/`. Décision : cron auto-curator → T2.2 (improvement continu).

### T2.2 Improvement continu (KR4)

- [ ] Cron weekly agent — audit `team-state.json` (cost trend, quality trend, escalation rate, retry rate), génère rapport
- [ ] Auto-tuning suggestions — si retry rate >20%, propose ajustement prompt agent concerné
- [ ] Amendment workflow — propose patch concrète sur agent.md, attend approval user

### T2.3 Token budget pré-launch alarms

- [ ] Estimation cumulée par sprint — alerte si budget mensuel projection >X€ avant launch
- [ ] Cost dashboard Grafana — Langfuse → Prometheus exporter

> **Pickup contingent — sprint 2026-05-05 P1 closure note (2026-05-05) :** start only if bandwidth available after the 2026-05-19 feature freeze ramp closes the P1 stack (cf. `docs/SPRINT_2026-05-05_PLAN.md`). KR3 stability + KR4 acquisition prime over orchestrateur tooling pre-launch. Re-evaluate at the post-launch + 14d retro.

---

## LATER — Q3+ 2026

- Multi-team parallel feature pipelines (2 features en parallèle, isolation worktree)
- Self-healing retry-with-backoff (failure transient → retry auto avec jitter, pas escalade humaine)
- A/B testing prompt variants (2 versions agent prompt, dispatcher pick gagnant sur metric)
- Memory consolidation auto — `MEMORY.md` index pruning quand >150L
- Cross-project skills sharing — skills réutilisables exportables vers autres projets
- Visual diff agent — output preview UI changes via screenshot comparison

---

## KILLED (ne pas redécider)

| Item | Date kill | Raison |
|---|---|---|
| `-30%/3×` cost claim research report (UFR-010 cancellation) | 2026-05-02 | Tous-Opus override pour qualité prod |
| 9-agent layout pré-V12 | 2026-05-02 | Consolidé en 6 agents (architect/editor/verifier/security/reviewer/documenter) |
| Tous-Opus rigide pour tous rôles | 2026-05-03 | Sonnet OK pour Documenter (T1.3) |

---

## Comment cette roadmap est consommée

`/team` lit ce fichier + `ROADMAP_PRODUCT.md` au démarrage chaque cycle (`team-hooks/pre-cycle-roadmap-load.sh`). Le dispatcher pioche dans NOW selon priorité + dépendances.

**Au merge feature** → coche auto `[x]` (`post-cycle-roadmap-update.sh`).
**Fin de sprint** → `/team roadmap:rotate` réécrit les 2 ROADMAPs propres, commit snapshot.

CLAUDE.md pointe ici comme source de vérité unique pour orchestration /team.
