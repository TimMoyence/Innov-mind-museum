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
| Tous-Opus (UFR-010) | shipped |

## Ce qui manque (gap analysis user 2026-05-03)

1. Pas d'estimation coût agent **avant** lancement (token budget per agent par feature)
2. Pas de feedback-loop interne (lessons learned auto-capturées)
3. Pas d'amélioration continue (audit weekly + tuning auto)
4. Pas d'eval auto qualité output (score post-run ≥85)
5. Pas de code review fait par agent dédié (cf. superpowers:requesting-code-review style)
6. Spec Kit pas mandatoire (opt-in actuel)
7. Tous-Opus = cher pour rôles non-critiques (Documenter)

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

- [ ] Edit `.claude/agents/documenter.md` — `model: claude-sonnet-4-6`
- [ ] UFR-010 amendment — exception explicite Documenter (justifier : output formaté simple, pas de raisonnement complexe, économie ~3× sans perte qualité)
- [ ] Verify regression — 5 runs documenter Sonnet vs Opus, compare output qualité

### T1.4 Spec Kit mandatoire enforcement (KR2)

- [ ] Dispatcher gate `team-hooks/pre-feature-spec-check.sh` — feature classifiée non-triviale (>3 fichiers ou >100 lignes ou touche security/auth/migration) sans `spec.md` + `design.md` + `tasks.md` → REJECT
- [ ] Trivial features (typo fix, dep bump, comment update) bypass auto
- [ ] Override flag `--no-spec-kit` réservé à user explicit (audit trail)

### T1.5 Auto-eval qualité output (KR3)

- [ ] Reviewer agent score post-run sur 5 axes (correctness, security, maintainability, test coverage, doc quality), 0-100 chacun
- [ ] Aggregate dans `team-state/quality-scores.json`
- [ ] Trigger amélioration : score <70 → escalade user, score 70-85 → corrective loop, score ≥85 → ship
- [ ] Promptfoo regression suite étendu — corpus 20 features types, fail si score moyen baisse >5pts entre runs

### T1.6 Auto-consolidation roadmap (intégration ROADMAP × /team)

- [ ] Hook `team-hooks/pre-cycle-roadmap-load.sh` — dispatcher lit `docs/ROADMAP_PRODUCT.md` + ce fichier au démarrage chaque cycle
- [ ] Hook `team-hooks/post-cycle-roadmap-update.sh` — au merge feature, propose `[x]` automatique sur item correspondant
- [ ] Fin sprint trigger — `/team roadmap:rotate` réécrit les 2 ROADMAPs (vide NOW, promote NEXT, archive snapshot via git commit)

---

## NEXT — Post-launch (juin–juillet)

### T2.1 Feedback-loop interne (KR4)

- [ ] Hook `team-hooks/post-complete-lesson-capture.sh` — chaque run produit 1 lesson markdown dans `team-knowledge/lessons/<date>-<slug>.md`
- [ ] Aggregator weekly — agent `learning-curator` synthétise lessons de la semaine, propose amendments à dispatcher rules
- [ ] User review queue — amendments proposés visibles via `/team learning:review`

### T2.2 Improvement continu (KR4)

- [ ] Cron weekly agent — audit `team-state.json` (cost trend, quality trend, escalation rate, retry rate), génère rapport
- [ ] Auto-tuning suggestions — si retry rate >20%, propose ajustement prompt agent concerné
- [ ] Amendment workflow — propose patch concrète sur agent.md, attend approval user

### T2.3 Token budget pré-launch alarms

- [ ] Estimation cumulée par sprint — alerte si budget mensuel projection >X€ avant launch
- [ ] Cost dashboard Grafana — Langfuse → Prometheus exporter

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
