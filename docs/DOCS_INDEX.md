# Docs Index — Musaium

> Table de vérité : toutes les docs importantes en un seul point.
> Last cleanup: **2026-05-07** (purge complète de `docs/archive/` après consolidation des 3 tech debts dans `docs/TECH_DEBT.md` + extension d'ADR-015 avec les seuils Phase A→B→C du sidecar P11. Suppression de SPRINT_2026-05-05_PLAN, HORIZONTAL_SCALING (override par ADR-021/022), CDN_CLOUDFLARE_SETUP (override par ADR-024), `museum-frontend/docs/DEPLOYMENT.md` (redondant avec OPS_DEPLOYMENT.md). FEATURE_KNOWLEDGE_BASE_WIKIDATA condensé en ADR-035. Drifts fixés : ADR-007 status, ADR-031 collision résolue (zod → ADR-034). Bilan net : -38 fichiers, -6390 lignes.)
> Previous cleanup: 2026-05-05 (backend hexagonal cleanup, codemod imports, god-files split).
> Previous cleanup: 2026-05-03 (consolidation V12, suppression 56 specs/plans/audits shipped, double roadmap PRODUCT+TEAM introduite).

## Sprint debrief pédagogique

**[`docs/explications-sprint-2026-05-05/`](explications-sprint-2026-05-05/README.md)** — 22 fichiers en français, "professeur explicatif", couvre les 12 blocs du sprint banking-grade hardening. Ouvre par le `README.md` du dossier pour la table des matières.

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
| ADRs (002-035) | [`docs/adr/`](adr/) |
| Tech debts trackés | [`docs/TECH_DEBT.md`](TECH_DEBT.md) |
| AI Voice pipeline V1 | [`docs/AI_VOICE.md`](AI_VOICE.md) |
| Knowledge Base (Wikidata) | [`docs/adr/ADR-035-knowledge-base-wikidata.md`](adr/ADR-035-knowledge-base-wikidata.md) |
| RBAC matrix (backend) | [`museum-backend/docs/rbac-matrix.md`](../museum-backend/docs/rbac-matrix.md) |
| SLO + observability strategy | [`docs/SLO.md`](SLO.md) |
| Capacity plan (10rps→1K→100K tiers) | [`docs/CAPACITY_PLAN.md`](CAPACITY_PLAN.md) |

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

`docs/archive/` a été supprimé le 2026-05-07 après consolidation. Pour récupérer un fichier historique : `git log --all -- docs/archive/<path>`. Tech debts encore actifs trackés dans `docs/TECH_DEBT.md`. Décisions devenues ADRs dans `docs/adr/`. Sprint debrief pédagogique dans `docs/explications-sprint-2026-05-05/`.

## Référence externe

- `CLAUDE.md` (racine) — instructions globales pour Claude Code
- `AGENTS.md` (racine) — config GitNexus + MCP tools

## Suppressions historiques

- **2026-05-07** : `docs/archive/` complet (33 fichiers, 6500L), `SPRINT_2026-05-05_PLAN.md`, `HORIZONTAL_SCALING.md`, `CDN_CLOUDFLARE_SETUP.md`, `museum-frontend/docs/DEPLOYMENT.md`, `FEATURE_KNOWLEDGE_BASE_WIKIDATA.md` (condensé en ADR-035). Bilan -38 fichiers, -6390 lignes.
- **2026-05-03** : 56 docs (V12 W1-W8 plans, banking-grade design, superpower plans/specs, lettered A-H, 2 audits, ADR 001/005/008 superseded, NL_LINKEDIN_*, NL_MASTER_PLAN, PROD_10_10_ROADMAP, NL5_S1, ROADMAP_ACTIVE, V2_PENDING).

Tout est dans `git log` si besoin de référence historique.

Source vérité produit : ROADMAP_PRODUCT.md uniquement.
Source vérité orchestrateur : ROADMAP_TEAM.md uniquement.
Source vérité tech debt : TECH_DEBT.md uniquement.
