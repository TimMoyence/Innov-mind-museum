# Docs Index — Musaium

> Table de vérité : toutes les docs importantes en un seul point.
> Last cleanup: **2026-05-20** (`docs/_archive/training-2026-05/` + `sprints/` supprimés (pollution : material pédagogique + recaps de sprint ; git history conservé), inbound refs des docs live nettoyées, **catch-all orphans pass** : ~32 docs orphelines indexées — `docs/legal/*`, `docs/operations/*`, ADRs 047-058, testing discipline, `GOTCHAS_ARCHIVE.md`, `AI_SAFETY.md`, `observability/DISTRIBUTED_TRACING.md`, `LESSONS_DIGEST.md`, handoff debt collision).
> Previous cleanup: 2026-05-17 (Deep absorption pass — 4 audit/worktree sources extraites puis supprimées : `docs/audit-2026-05-12/`, `docs/audit-2026-05-12-raw/`, `docs/chat-ux-refonte/`, `docs/roadmap-night/`, `docs/plans/`, `stryker-admin-night.log`, 24 team-reports subdirs absorbés + `working/`. Extractions : 5 ADRs (054-058), 19 TDs (TD-21..39), 5 gotchas CLAUDE.md, 3 doctrines MEMORY.md. `team-reports/2026-05-05-recap-investigation/` promu repo-root archive.).
> Previous cleanup: 2026-05-12 (sprint audit-cleanup-2026-05-12 — archive `docs/_archive/` introduit, `explications-sprint-2026-05-05/` + `SPRINT_RECAP_2026-04-30_TO_2026-05-05.md` déplacés en archive, ADR-033+034 mergés, 5 plans périmés supprimés, 3 docs museum-frontend stales supprimés, 18+ dangling refs corrigés, 6 stubs ADR deferred V1.1 créés).
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
| ADRs (002-068) | [`docs/adr/`](adr/) |
| Architecture (BE hex / FE Expo / Web Next.js) | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) + `CLAUDE.md` § Architecture (summary) |
| Phase history (test/quality hardening 8-13) | [`docs/PHASE_HISTORY.md`](PHASE_HISTORY.md) |
| Gotchas archive (less-frequent pitfalls, split from CLAUDE.md 2026-05-20) | [`docs/GOTCHAS_ARCHIVE.md`](GOTCHAS_ARCHIVE.md) |
| Test discipline — DRY factories | [`docs/TEST_FACTORIES.md`](TEST_FACTORIES.md) + `CLAUDE.md` § Test Discipline (quick ref) + `tests/helpers/**/*.fixtures.ts` |
| Test index (full repo test inventory) | [`docs/TEST_INDEX.md`](TEST_INDEX.md) |
| Test coverage inventory (UFR-021 baseline) | [`docs/TEST_COVERAGE_INVENTORY.md`](TEST_COVERAGE_INVENTORY.md) |
| Testing discipline proposal (UFR-021 spec) | [`docs/TESTING_DISCIPLINE_PROPOSAL.md`](TESTING_DISCIPLINE_PROPOSAL.md) |
| Testing Phase 2 plan (UFR-021 pre-push gate + CI mirror) | [`docs/TESTING_PHASE2_PLAN.md`](TESTING_PHASE2_PLAN.md) |
| ESLint discipline | [`docs/LINT_DISCIPLINE.md`](LINT_DISCIPLINE.md) + `CLAUDE.md` § ESLint Discipline (quick ref) |
| Tech debts trackés | [`docs/TECH_DEBT.md`](TECH_DEBT.md) |
| AI Voice pipeline V1 | [`docs/AI_VOICE.md`](AI_VOICE.md) |
| AI Safety (chat guardrails defense-in-depth, full spec) | [`docs/AI_SAFETY.md`](AI_SAFETY.md) + `CLAUDE.md` § AI Safety (quick ref) |
| Knowledge Base (Wikidata) | [`docs/adr/ADR-035-knowledge-base-wikidata.md`](adr/ADR-035-knowledge-base-wikidata.md) |
| LLM cache strategy (single-source) | [`docs/adr/ADR-036-llm-cache-strategy.md`](adr/ADR-036-llm-cache-strategy.md) |
| Visual similarity (C3, SigLIP + pgvector) | [`docs/adr/ADR-037-visual-similarity-siglip-pgvector.md`](adr/ADR-037-visual-similarity-siglip-pgvector.md), runbook [`docs/AI_VISUAL_SIMILARITY.md`](AI_VISUAL_SIMILARITY.md) |
| Anti-hallucination (C4, citations v2 + WebSearch fallback) | [`docs/adr/ADR-038-anti-hallucination-citations-websearch.md`](adr/ADR-038-anti-hallucination-citations-websearch.md) — *Accepted-Implemented* (`c72ec2ba` 2026-05-11) |
| Wikidata résilient (C5, opossum CB + organic local dump) | [`docs/adr/ADR-039-wikidata-resilient-circuit-breaker.md`](adr/ADR-039-wikidata-resilient-circuit-breaker.md) |
| Zod 3/4 status quo + defer plan (BE) | [`docs/adr/ADR-033-zod-status-quo-and-defer-plan.md`](adr/ADR-033-zod-status-quo-and-defer-plan.md) |
| RBAC matrix (backend) | `museum-backend/src/helpers/middleware/require-role.middleware.ts` + ADR-013 / ADR-014 (matrix not yet extracted to its own doc) |
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

### ADRs 047-068 (audit-360 W1/W2/W3 + ultrareview + 2026-05-17/19/22/26 sprints)

| ADR | Subject |
|---|---|
| [`ADR-047`](adr/ADR-047-llm-guard-circuit-breaker-fail-closed.md) | LLM Guard sidecar circuit-breaker fail-closed |
| [`ADR-048`](adr/ADR-048-guardrail-strategy-interface.md) | Guardrail strategy interface (V1/V2 polymorphism) |
| [`ADR-049`](adr/ADR-049-llm-security-ci-gates.md) | LLM security CI gates (promptfoo OWASP LLM07 ; garak deferred) |
| [`ADR-050`](adr/ADR-050-accept-langfuse-v3-eol.md) | Accept Langfuse v3 EOL risk |
| [`ADR-051`](adr/ADR-051-oss-guardrail-providers-ready.md) | OSS guardrail providers (Mistral/Llama Guard) ready, gated by ADR-048 |
| [`ADR-052`](adr/ADR-052-user-suspend-softdelete.md) | User suspend/soft-delete semantics |
| [`ADR-053`](adr/ADR-053-apple-5-1-2-i-granular-consent.md) | Apple §5.1.2(i) granular consent |
| [`ADR-054`](adr/ADR-054-audit-chain-merkle-batch-redesign.md) | Audit chain Merkle batch redesign (100k MAU scale) |
| [`ADR-055`](adr/ADR-055-bottomsheet-router-state-machine.md) | BottomSheet router state machine |
| [`ADR-056`](adr/ADR-056-a5-phase-client-side-simulated.md) | A5 phase client-side simulated |
| [`ADR-057`](adr/ADR-057-webauthn-rp-id-decision-deferred.md) | WebAuthn RP-ID decision deferred |
| [`ADR-058`](adr/ADR-058-selective-hexagonal-ports-policy.md) | Selective hexagonal ports policy |
| [`ADR-059`](adr/ADR-059-connectivity-single-source-online-manager-bridge.md) | Connectivity single source of truth + `onlineManager` bridge |
| [`ADR-060`](adr/ADR-060-gdpr-erasure-dsar-compliance-chain.md) | GDPR Art.17 erasure chain + Art.15 DSAR export schemaVersion 2 |
| [`ADR-061`](adr/ADR-061-i-sec8-artwork-knowledge-not-multi-tenant.md) | I-SEC8 reclassification: `artwork_knowledge` global catalogue |
| [`ADR-062`](adr/ADR-062-canonical-legal-content-source.md) | Single canonical source for legal content with CI drift sentinel |
| [`ADR-063`](adr/ADR-063-langfuse-mask-central-stripfreetext.md) | Langfuse central `mask` au ctor (`stripFreeText`) |
| [`ADR-064`](adr/ADR-064-access-token-denylist-fail-open.md) | Access-token denylist Redis adapter fail-OPEN |
| [`ADR-065`](adr/ADR-065-redis-volatile-ttl-with-bullmq-caveat.md) | Redis prod eviction policy `volatile-ttl` + BullMQ caveat |
| [`ADR-066`](adr/ADR-066-rn-modal-pointer-events-routing.md) | RN overlay `pointerEvents="box-none"` routing convention (backdrop dismiss + slab interactive) |
| [`ADR-067`](adr/ADR-067-base-modal-custom-vs-radix.md) | BaseModal custom (museum-web) — defer Radix UI Dialog post-launch |
| [`ADR-068`](adr/ADR-068-sbom-attestation-strategy-mobile-gap.md) | SBOM attestation strategy (mobile gap deferred to CRA 2027) |

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
| VDP triage & incident response (GDPR 72h + CRA 24h/72h/14d) | [`docs/operations/VDP_RUNBOOK.md`](operations/VDP_RUNBOOK.md) |
| Vulnerability Disclosure Policy (root) | [`SECURITY.md`](../SECURITY.md) — published at `musaium.com/{fr,en}/security` + RFC 9116 at `/.well-known/security.txt` |
| Grafana dashboard JSON | [`docs/observability/musaium-backend-dashboard.json`](observability/musaium-backend-dashboard.json) |
| Distributed tracing (Sentry+OTel, header bridge BE↔FE) | [`docs/observability/DISTRIBUTED_TRACING.md`](observability/DISTRIBUTED_TRACING.md) |
| Capacity plan 100k MAU | [`docs/operations/CAPACITY_PLAN_100K.md`](operations/CAPACITY_PLAN_100K.md) |
| Chaos gameday 2026-05 | [`docs/operations/CHAOS_GAMEDAY_2026-05.md`](operations/CHAOS_GAMEDAY_2026-05.md) |
| CNIL breach notification dry-run | [`docs/operations/CNIL_BREACH_NOTIFICATION_DRYRUN.md`](operations/CNIL_BREACH_NOTIFICATION_DRYRUN.md) |
| ENISA SRP onboarding | [`docs/operations/ENISA_SRP_ONBOARDING.md`](operations/ENISA_SRP_ONBOARDING.md) |
| Incident contacts | [`docs/operations/INCIDENT_CONTACTS.md`](operations/INCIDENT_CONTACTS.md) |
| Lighthouse audit | [`docs/operations/LIGHTHOUSE_AUDIT.md`](operations/LIGHTHOUSE_AUDIT.md) |
| Pentest scope | [`docs/operations/PENTEST_SCOPE.md`](operations/PENTEST_SCOPE.md) |
| PGP key generation runbook | [`docs/operations/PGP_KEY_GENERATION.md`](operations/PGP_KEY_GENERATION.md) |
| Postmortem template | [`docs/operations/POSTMORTEM_TEMPLATE.md`](operations/POSTMORTEM_TEMPLATE.md) |
| Security mailbox setup | [`docs/operations/SECURITY_MAILBOX_SETUP.md`](operations/SECURITY_MAILBOX_SETUP.md) |
| Sentry P0 triage 2026-05-20 | [`docs/operations/SENTRY_P0_TRIAGE_2026-05-20.md`](operations/SENTRY_P0_TRIAGE_2026-05-20.md) |

## Incidents & Compliance

| Doc | Path |
|---|---|
| Breach playbook | [`docs/incidents/BREACH_PLAYBOOK.md`](incidents/BREACH_PLAYBOOK.md) |
| Post-mortem template | [`docs/incidents/POST_MORTEM_TEMPLATE.md`](incidents/POST_MORTEM_TEMPLATE.md) |
| Tabletop exercises | [`docs/incidents/tabletop/`](incidents/tabletop/) |
| Data flow map | [`docs/compliance/DATA_FLOW_MAP.md`](compliance/DATA_FLOW_MAP.md) |
| Subprocessors (canonical Art. 28 ledger) | [`docs/compliance/SUBPROCESSORS.md`](compliance/SUBPROCESSORS.md) — pointer also at [`docs/legal/SUBPROCESSORS.md`](legal/SUBPROCESSORS.md) |

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
| AI disclosure (user-facing) | [`docs/legal/AI_DISCLOSURE.md`](legal/AI_DISCLOSURE.md) |
| AI disclosure — audit trail | [`docs/legal/AI_DISCLOSURE_AUDIT.md`](legal/AI_DISCLOSURE_AUDIT.md) |
| DPIA (Data Protection Impact Assessment) | [`docs/legal/DPIA.md`](legal/DPIA.md) |
| DPIA T1.1 addendum | [`docs/legal/DPIA_T1.1_addendum.md`](legal/DPIA_T1.1_addendum.md) |
| DPIA + ROPA readiness | [`docs/legal/DPIA_ROPA_READINESS.md`](legal/DPIA_ROPA_READINESS.md) |
| ROPA (Record of Processing Activities) | [`docs/legal/ROPA.md`](legal/ROPA.md) |
| Subprocessors pointer (canonical = `docs/compliance/SUBPROCESSORS.md`) | [`docs/legal/SUBPROCESSORS.md`](legal/SUBPROCESSORS.md) |
| Accessibility statement (FR) | [`docs/legal/accessibility-statement-fr.md`](legal/accessibility-statement-fr.md) |
| Accessibility statement (EN) | [`docs/legal/accessibility-statement-en.md`](legal/accessibility-statement-en.md) |

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
| /team knowledge — lessons (digest + per-incident) | [`.claude/skills/team/team-knowledge/lessons/LESSONS_DIGEST.md`](../.claude/skills/team/team-knowledge/lessons/LESSONS_DIGEST.md) + sibling `*-<incident>.md` |

## GitNexus

- [`AGENTS.md`](../AGENTS.md) (racine) — config GitNexus + MCP tools

## Archive (historical reference)

- **`docs/_archive/`** — read-only archive in-tree. **État au 2026-05-20** : ne contient plus que `README.md` (pointeur). `training-2026-05/` (training material) + `sprints/` (sprint recaps `2026-04-30_TO_2026-05-05`) supprimés 2026-05-20 (pollution ; recoverable via `git log --all -- docs/_archive/<path>`). Future use : snapshots `/team roadmap:rotate` (`roadmaps/<sprint-end>/`) — non créés à ce jour.
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
