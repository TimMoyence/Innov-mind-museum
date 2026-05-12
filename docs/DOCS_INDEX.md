# Docs Index — Musaium

> Table de vérité : toutes les docs importantes en un seul point.
> Last cleanup: **2026-05-12** (sprint audit-cleanup-2026-05-12 — archive `docs/_archive/` introduit, `explications-sprint-2026-05-05/` + `SPRINT_RECAP_2026-04-30_TO_2026-05-05.md` déplacés en archive, ADR-033+034 mergés, 5 plans périmés supprimés, 3 docs museum-frontend stales supprimés, 18+ dangling refs corrigés, 6 stubs ADR deferred V1.1 créés).
> Previous cleanup: 2026-05-07 (purge complète de `docs/archive/`, suppression HORIZONTAL_SCALING, CDN_CLOUDFLARE_SETUP, FEATURE_KNOWLEDGE_BASE_WIKIDATA).
> Previous cleanup: 2026-05-05 (backend hexagonal cleanup, codemod imports, god-files split).

## Roadmap (vivante, triple)

| Doc | Path | Refresh |
|---|---|---|
| **Roadmap Produit** (features, OKR, NOW/NEXT/LATER) | [`docs/ROADMAP_PRODUCT.md`](ROADMAP_PRODUCT.md) | Réécrit chaque sprint (4 sem) |
| **Roadmap /team** (orchestrateur v13, OKR cost+quality) | [`docs/ROADMAP_TEAM.md`](ROADMAP_TEAM.md) | Réécrit chaque sprint (4 sem) |
| **Roadmap FE RN best practices** (audit 2026-05-03 → score 86 → 92+) | [`docs/ROADMAP_FE_RN_BEST_PRACTICES.md`](ROADMAP_FE_RN_BEST_PRACTICES.md) | Réécrit chaque sprint (4 sem) |

Snapshots précédents : `git log -- docs/ROADMAP_*.md`.

## Architecture & Decisions

| Doc | Path |
|---|---|
| ADRs (002-046) | [`docs/adr/`](adr/) |
| Architecture (BE hex / FE Expo / Web Next.js) | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) |
| Phase history (test/quality hardening 8-13) | [`docs/PHASE_HISTORY.md`](PHASE_HISTORY.md) |
| Test discipline — DRY factories | [`docs/TEST_FACTORIES.md`](TEST_FACTORIES.md) |
| ESLint discipline | [`docs/LINT_DISCIPLINE.md`](LINT_DISCIPLINE.md) |
| Tech debts trackés | [`docs/TECH_DEBT.md`](TECH_DEBT.md) |
| AI Voice pipeline V1 | [`docs/AI_VOICE.md`](AI_VOICE.md) |
| Knowledge Base (Wikidata) | [`docs/adr/ADR-035-knowledge-base-wikidata.md`](adr/ADR-035-knowledge-base-wikidata.md) |
| LLM cache strategy (single-source) | [`docs/adr/ADR-036-llm-cache-strategy.md`](adr/ADR-036-llm-cache-strategy.md) |
| Visual similarity (C3, SigLIP + pgvector) | [`docs/adr/ADR-037-visual-similarity-siglip-pgvector.md`](adr/ADR-037-visual-similarity-siglip-pgvector.md), runbook [`docs/AI_VISUAL_SIMILARITY.md`](AI_VISUAL_SIMILARITY.md) |
| Anti-hallucination (C4, citations v2 + WebSearch fallback) | [`docs/adr/ADR-038-anti-hallucination-citations-websearch.md`](adr/ADR-038-anti-hallucination-citations-websearch.md) — *Accepted-Implemented* (`c72ec2ba` 2026-05-11) |
| Wikidata résilient (C5, opossum CB + organic local dump) | [`docs/adr/ADR-039-wikidata-resilient-circuit-breaker.md`](adr/ADR-039-wikidata-resilient-circuit-breaker.md) |
| Zod 3/4 status quo + defer plan (BE) | [`docs/adr/ADR-033-zod-status-quo-and-defer-plan.md`](adr/ADR-033-zod-status-quo-and-defer-plan.md) |
| RBAC matrix (backend) | [`museum-backend/docs/rbac-matrix.md`](../museum-backend/docs/rbac-matrix.md) |
| SLO + observability strategy | [`docs/SLO.md`](SLO.md) |
| Capacity plan (10rps→1K→100K tiers) | [`docs/CAPACITY_PLAN.md`](CAPACITY_PLAN.md) |

### Deferred V1.1 ADR stubs (sprint audit-cleanup-2026-05-12)

| ADR | Subject |
|---|---|
| [`ADR-040`](adr/ADR-040-c3-image-comparative-full-deferred.md) | C3 image comparative full UI deferred V1.1 |
| [`ADR-041`](adr/ADR-041-w1-walk-transitions-deferred.md) | W1 walk transitions deferred V1.1 |
| [`ADR-042`](adr/ADR-042-voice-webrtc-streaming-deferred.md) | Voice WebRTC realtime deferred V1.1 |
| [`ADR-043`](adr/ADR-043-typeorm-drizzle-prisma-post-launch.md) | TypeORM → Drizzle / Prisma deferred H2 2026 |
| [`ADR-044`](adr/ADR-044-multi-tenant-museum-onboarding-deferred.md) | Multi-tenant museum onboarding deferred V1.1 |
| [`ADR-045`](adr/ADR-045-shared-observability-package-extraction.md) | `@musaium/shared/observability` extraction deferred |
| [`ADR-046`](adr/ADR-046-zod-4-be-migration-deferred.md) | Zod 4 BE migration deferred per ADR-033 |

## Operations

| Doc | Path |
|---|---|
| Deployment & Runbook (single source) | [`docs/OPS_DEPLOYMENT.md`](OPS_DEPLOYMENT.md) |
| Migration governance | [`docs/MIGRATION_GOVERNANCE.md`](MIGRATION_GOVERNANCE.md) |
| Chaos runbooks | [`docs/CHAOS_RUNBOOKS.md`](CHAOS_RUNBOOKS.md) |
| Runbooks | [`docs/RUNBOOKS/`](RUNBOOKS/) — auto-rollback, prod secrets bootstrap, redis rotation, secrets rotation, audit-chain forensics, CERT_ROTATION, V1 fallbacks |
| CI/CD Secrets | [`docs/CI_CD_SECRETS.md`](CI_CD_SECRETS.md) |
| GitHub Actions SHA pins | [`docs/GITHUB_ACTIONS_SHA_PINS.md`](GITHUB_ACTIONS_SHA_PINS.md) |
| DB Backup & Restore | [`docs/DB_BACKUP_RESTORE.md`](DB_BACKUP_RESTORE.md) |
| Uptime Monitoring | [`docs/UPTIME_MONITORING.md`](UPTIME_MONITORING.md) |
| Release Checklist | [`docs/RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) |
| Scaling — design only | [`docs/adr/ADR-021-pgbouncer-transaction-mode.md`](adr/ADR-021-pgbouncer-transaction-mode.md), [`ADR-022`](adr/ADR-022-pg-read-replica-strategy.md), [`ADR-023`](adr/ADR-023-redis-cluster-vs-sentinel.md), [`ADR-024`](adr/ADR-024-cloudflare-cdn-strategy.md) |
| Network hardening (security) | [`docs/security/network-hardening.md`](security/network-hardening.md) |
| Grafana dashboard JSON | [`docs/observability/musaium-backend-dashboard.json`](observability/musaium-backend-dashboard.json) |

## Incidents & Compliance

| Doc | Path |
|---|---|
| Breach playbook | [`docs/incidents/BREACH_PLAYBOOK.md`](incidents/BREACH_PLAYBOOK.md) |
| Post-mortem template | [`docs/incidents/POST_MORTEM_TEMPLATE.md`](incidents/POST_MORTEM_TEMPLATE.md) |
| Tabletop exercises | [`docs/incidents/tabletop/`](incidents/tabletop/) |
| Data flow map | [`docs/compliance/DATA_FLOW_MAP.md`](compliance/DATA_FLOW_MAP.md) |
| Subprocessors | [`docs/compliance/SUBPROCESSORS.md`](compliance/SUBPROCESSORS.md) |

## Mobile & Store

| Doc | Path |
|---|---|
| Mobile Internal Testing Flow | [`docs/MOBILE_INTERNAL_TESTING_FLOW.md`](MOBILE_INTERNAL_TESTING_FLOW.md) |
| Store Submission Guide | [`docs/STORE_SUBMISSION_GUIDE.md`](STORE_SUBMISSION_GUIDE.md) |
| Google Play Data Safety | [`docs/GOOGLE_PLAY_DATA_SAFETY.md`](GOOGLE_PLAY_DATA_SAFETY.md) |
| iOS 26 crash diag (still active) | [`museum-frontend/docs/IOS26_CRASH_DIAG.md`](../museum-frontend/docs/IOS26_CRASH_DIAG.md) |

## Auth & Legal

| Doc | Path |
|---|---|
| Social auth setup | [`docs/SOCIAL_AUTH_SETUP.md`](SOCIAL_AUTH_SETUP.md) |
| Privacy policy (HTML, deployed) | [`docs/privacy-policy.html`](privacy-policy.html) |
| Contributing | [`docs/CONTRIBUTING.md`](CONTRIBUTING.md) |

## Skills & Agents (`.claude/`)

| Asset | Path |
|---|---|
| /team Skill | `.claude/skills/team/SKILL.md` |
| /team SDLC Index | `.claude/skills/team/team-sdlc-index.md` |
| Agents (6 — architect, editor, verifier, security, reviewer, documenter) | `.claude/agents/*.md` |
| /team runtime reports (active) | `.claude/skills/team/team-reports/` |
| /team protocols | `.claude/skills/team/team-protocols/` |
| /team templates (Spec Kit) | `.claude/skills/team/team-templates/` |
| /team hooks | `.claude/skills/team/team-hooks/` |
| /team durable state | `.claude/skills/team/team-state/` |

## GitNexus

- [`AGENTS.md`](../AGENTS.md) (racine) — config GitNexus + MCP tools

## Archive (historical reference)

- **`docs/_archive/`** — read-only archive in-tree. Contents:
  - `training-2026-05/explications-sprint-2026-05-05/` (22 files, 6239L, French training material from sprint 2026-04-30 → 2026-05-05)
  - `sprints/SPRINT_RECAP_2026-04-30_TO_2026-05-05.md` (1403L)
- **`docs/archive/`** (old name) was deleted 2026-05-07. Recover via `git log --all -- docs/archive/<path>`. Tech debts encore actifs trackés dans `docs/TECH_DEBT.md`. Décisions devenues ADRs dans `docs/adr/`.

## Référence externe

- `CLAUDE.md` (racine) — instructions globales pour Claude Code
- `AGENTS.md` (racine) — config GitNexus + MCP tools

## Suppressions historiques

- **2026-05-12** : `docs/explications-sprint-2026-05-05/` → `docs/_archive/training-2026-05/` (move). `docs/SPRINT_RECAP_2026-04-30_TO_2026-05-05.md` → `docs/_archive/sprints/` (move). `docs/plans/2026-05-08-stryker-incremental-strategy.md`, `docs/plans/2026-05-10-c{4,5}-launch-prompt.md`, `docs/plans/2026-05-10-stryker-night-tracker.md`, `docs/plans/2026-05-11-stryker-night-recap.md` supprimés (info consolidée dans `docs/PHASE_HISTORY.md` Phase 12). `museum-frontend/docs/{ARCHITECTURE_MAP,QUALITY_GUIDE,NEXT_LEVEL_MOBILE_PRODUCTION_AND_TEST}.md` supprimés (stales). `docs/adr/ADR-033-zod-3-4-status-quo.md` + `docs/adr/ADR-034-zod-3-to-4-deferred.md` mergés en `docs/adr/ADR-033-zod-status-quo-and-defer-plan.md`.
- **2026-05-07** : `docs/archive/` complet (33 fichiers, 6500L), `SPRINT_2026-05-05_PLAN.md`, `HORIZONTAL_SCALING.md`, `CDN_CLOUDFLARE_SETUP.md`, `museum-frontend/docs/DEPLOYMENT.md`, `FEATURE_KNOWLEDGE_BASE_WIKIDATA.md` (condensé en ADR-035). Bilan -38 fichiers, -6390 lignes.
- **2026-05-03** : 56 docs (V12 W1-W8 plans, banking-grade design, superpower plans/specs, lettered A-H, 2 audits, ADR 001/005/008 superseded, NL_LINKEDIN_*, NL_MASTER_PLAN, PROD_10_10_ROADMAP, NL5_S1, ROADMAP_ACTIVE, V2_PENDING).

Tout est dans `git log` si besoin de référence historique.

Source vérité produit : ROADMAP_PRODUCT.md uniquement.
Source vérité orchestrateur : ROADMAP_TEAM.md uniquement.
Source vérité tech debt : TECH_DEBT.md uniquement.
