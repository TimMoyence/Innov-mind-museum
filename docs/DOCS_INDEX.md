# Docs Index — Musaium

> Table de vérité : toutes les docs importantes en un seul point.
> Last cleanup: **2026-05-03** (consolidation V12, suppression 56 specs/plans/audits shipped, double roadmap PRODUCT+TEAM introduite).

## Roadmap (vivante, double)

| Doc | Path | Refresh |
|---|---|---|
| **Roadmap Produit** (features, OKR, NOW/NEXT/LATER) | [`docs/ROADMAP_PRODUCT.md`](ROADMAP_PRODUCT.md) | Réécrit chaque sprint (4 sem) |
| **Roadmap /team** (orchestrateur v13, OKR cost+quality) | [`docs/ROADMAP_TEAM.md`](ROADMAP_TEAM.md) | Réécrit chaque sprint (4 sem) |

Snapshots précédents : `git log -- docs/ROADMAP_*.md`.

## Architecture & Decisions

| Doc | Path |
|---|---|
| ADRs (002-028) | [`docs/adr/`](adr/) |
| AI Voice pipeline V1 | [`docs/AI_VOICE.md`](AI_VOICE.md) |
| Feature Knowledge Base (Wikidata) | [`docs/FEATURE_KNOWLEDGE_BASE_WIKIDATA.md`](FEATURE_KNOWLEDGE_BASE_WIKIDATA.md) |
| RBAC matrix (backend) | [`museum-backend/docs/rbac-matrix.md`](../museum-backend/docs/rbac-matrix.md) |
| SLO + observability strategy | [`docs/SLO.md`](SLO.md) |
| Capacity plan (10rps→1K→100K tiers) | [`docs/CAPACITY_PLAN.md`](CAPACITY_PLAN.md) |

## Operations

| Doc | Path |
|---|---|
| Deployment & Runbook (single source) | [`docs/OPS_DEPLOYMENT.md`](OPS_DEPLOYMENT.md) |
| Migration governance | [`docs/MIGRATION_GOVERNANCE.md`](MIGRATION_GOVERNANCE.md) |
| Chaos runbooks | [`docs/CHAOS_RUNBOOKS.md`](CHAOS_RUNBOOKS.md) |
| Runbooks | [`docs/RUNBOOKS/`](RUNBOOKS/) — auto-rollback, redis rotation, V1 fallbacks, prod secrets bootstrap, secrets rotation, audit-chain forensics |
| CI/CD Secrets | [`docs/CI_CD_SECRETS.md`](CI_CD_SECRETS.md) |
| GitHub Actions SHA pins | [`docs/GITHUB_ACTIONS_SHA_PINS.md`](GITHUB_ACTIONS_SHA_PINS.md) |
| DB Backup & Restore | [`docs/DB_BACKUP_RESTORE.md`](DB_BACKUP_RESTORE.md) |
| Uptime Monitoring | [`docs/UPTIME_MONITORING.md`](UPTIME_MONITORING.md) |
| Release Checklist | [`docs/RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) |
| Horizontal Scaling | [`docs/HORIZONTAL_SCALING.md`](HORIZONTAL_SCALING.md) |
| CDN Cloudflare Setup | [`docs/CDN_CLOUDFLARE_SETUP.md`](CDN_CLOUDFLARE_SETUP.md) |
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
| Mobile architecture map | [`museum-frontend/docs/ARCHITECTURE_MAP.md`](../museum-frontend/docs/ARCHITECTURE_MAP.md) |
| Mobile quality guide | [`museum-frontend/docs/QUALITY_GUIDE.md`](../museum-frontend/docs/QUALITY_GUIDE.md) |
| Mobile production runbook | [`museum-frontend/docs/NEXT_LEVEL_MOBILE_PRODUCTION_AND_TEST.md`](../museum-frontend/docs/NEXT_LEVEL_MOBILE_PRODUCTION_AND_TEST.md) |

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

| Bucket | Path | Contains |
|---|---|---|
| Legacy roadmap (V3 review) | [`docs/archive/roadmaps/`](archive/roadmaps/) | V3_REVIEW_AND_PLAN |
| V1 sprint journal | [`docs/archive/v1-sprint-2026-04/`](archive/v1-sprint-2026-04/) | Progress tracker + sprint log + audits |
| Modular plans 2026-04-17 | [`docs/archive/plans-2026-04-17/`](archive/plans-2026-04-17/) | 12 plans Phase 1-3 (closed) |
| NL reports 2026-04-17 | [`docs/archive/nl-reports-2026-04-17/reports/`](archive/nl-reports-2026-04-17/reports/) | NL agents output |
| Full-codebase analyse pré-S1 | [`docs/archive/fullcodebase-analyse/`](archive/fullcodebase-analyse/) | 12 reports historiques |
| Team reports legacy v2 (March 2026) | [`docs/archive/team-reports-legacy-v2/`](archive/team-reports-legacy-v2/) | 16 audits |
| Team knowledge legacy | [`docs/archive/team-knowledge-legacy/`](archive/team-knowledge-legacy/) | Agent perf, error patterns |

## Référence externe

- `CLAUDE.md` (racine) — instructions globales pour Claude Code
- `AGENTS.md` (racine) — config GitNexus + MCP tools

## Ce qui a été supprimé (2026-05-03)

Pour info : 56 docs (V12 W1-W8 plans, banking-grade design, 13 superpower plans + 20 superpower specs Phase 0-8 / Spec A-D / lettered A-H, 2 audits, ADR 001/005/008 superseded, NL_LINKEDIN_*, NL_MASTER_PLAN, PROD_10_10_ROADMAP, NL5_S1, ROADMAP_ACTIVE, V2_PENDING). Tout est dans `git log` si besoin de référence historique.

Source vérité produit : ROADMAP_PRODUCT.md uniquement.
Source vérité orchestrateur : ROADMAP_TEAM.md uniquement.
