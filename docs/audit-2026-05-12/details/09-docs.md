# 09 — Documentation audit
**Date:** 2026-05-12  **Agent:** AGENT-09  **Scope:** all `*.md` outside `node_modules/`, `.test-dist/`, `museum-backend/dist/`

## Verdict
- Doc signal/noise ratio (0=pure noise, 100=lean): **72**
- Onboarding clarity (0-100): **58** (README lies about features + dead-links cripple new dev's first 5 minutes)
- Drift (0=aligned, 100=fictional): **22** (most ADRs verified against code; CLAUDE.md + READMEs lag; TECH_DEBT has duplicate IDs)
- Estimated **KEEP 78 / FOLD 9 / ARCHIVE 5 / DELETE 0** for `docs/` tree (excluding ADRs and `_archive/`, all 41 ADRs = KEEP, all 24 archive files = ARCHIVE-as-is). With ADRs+archive: KEEP 119 / FOLD 9 / ARCHIVE 24 / DELETE 0.
- **Honest read**: The docs tree is in the best shape of the project's life — the 2026-05-12 cleanup sprint (just before this audit) consolidated `docs/_archive/`, killed `docs/plans/`, merged ADR-033/034, archived the 22-file French training material, and updated DOCS_INDEX. The remaining rot is concentrated in **5 specific lying surfaces** that any new dev hits in the first hour: (1) root `CLAUDE.md` claims ARCHITECTURE/TEST_FACTORIES/LINT_DISCIPLINE are "not yet extracted" when they were extracted 2026-05-07 (5+ days stale); (2) `README.md` references ADR-001 (deleted 2026-05-03) and claims "multi-tenancy support" when ADR-044 explicitly defers it to V1.1; (3) `museum-frontend/README.md` links to `docs/QUALITY_GUIDE.md` and `docs/ARCHITECTURE_MAP.md` — both deleted earlier today per DOCS_INDEX history; (4) `museum-web/README.md` links to `../docs/CDN_CLOUDFLARE_SETUP.md` deleted 2026-05-07; (5) `docs/TECH_DEBT.md` has **two TD-5 entries** (duplicate ID — bug). CLAUDE.md also references `.claude/tasks/` which does not exist. The `_archive/` tree is correctly fenced, ADRs are dense but well-cross-referenced, and the `docs/audit-2026-05-12/details/` current-audit output is the right home for parallel-agent reports. No useless skeletons or lorem ipsum.

## Method

- 117 markdown files counted under `docs/`, 3 at repo root (`CLAUDE.md`, `AGENTS.md`, `README.md`), 3 app READMEs, 3 app-level docs (`museum-backend/docs/rbac-matrix.md`, `museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.md`, `museum-frontend/docs/IOS26_CRASH_DIAG.md`), 86 `.md` under `.claude/skills/`. Total `*.md`: ~213.
- Queries run:
  - `find docs -type f -name '*.md' | xargs wc -l | sort -rn` for size ranking.
  - `git log -1 --format='%h %ad' --date=short -- <path>` for last-touched per file (live + ADRs + RUNBOOKS + incidents + legal + compliance + security).
  - `grep -rln "QUALITY_GUIDE\|ARCHITECTURE_MAP\|CDN_CLOUDFLARE_SETUP\|ADR-001\|ADR-005\|ADR-008\|ADR-034\|HORIZONTAL_SCALING\|FEATURE_KNOWLEDGE_BASE_WIKIDATA\|NEXT_LEVEL_MOBILE"` to find dangling refs.
  - `grep -rln "TEST_FACTORIES.md\|LINT_DISCIPLINE.md\|ARCHITECTURE.md\|MIGRATION_GOVERNANCE.md"` to verify "not yet extracted" claims.
  - `ls .claude/tasks/` (does not exist — referenced in `CLAUDE.md:28`).
  - ADR cross-check vs code: ADR-009 vs `museum-frontend/app.config.ts` (verified), ADR-011 vs `museum-backend/src/helpers/middleware/rate-limit.middleware.ts:111` + `src/config/env.ts:198` (verified), ADR-013 vs `museum-backend/src/modules/auth/useCase/session/mfa-gate.service.ts:52` (verified).
  - Verified that `docs/ARCHITECTURE.md`, `docs/TEST_FACTORIES.md`, `docs/LINT_DISCIPLINE.md`, `docs/MIGRATION_GOVERNANCE.md` ALL exist (file sizes 8837 / 3392 / 3717 / 4246 bytes, last touched ≤ 2026-05-12).

## Per-file classification

`docs/` root (alphabetical):

| Path | LOC | Last touched | Class | Reason |
|---|---|---|---|---|
| `docs/AI_VISUAL_SIMILARITY.md` | 154 | 2026-05-10 (`f2c14c9eb`) | KEEP | C3 runbook companion to ADR-037; load-bearing for SigLIP pipeline. |
| `docs/AI_VOICE.md` | 190 | 2026-05-12 (`9471649db`) | KEEP | V1 voice pipeline spec, current. References deleted ADR-001 with `git log` recovery (acceptable). |
| `docs/ARCHITECTURE.md` | 128 | 2026-05-12 (`9471649db`) | KEEP | Extracted 2026-05-07 per its own header. **CLAUDE.md still lies about its absence** — fix CLAUDE.md, not this file. |
| `docs/CAPACITY_PLAN.md` | 78 | 2026-05-03 (`da5515271`) | KEEP | 10rps→1K→100K design tiers; one of the few capacity-modeling docs. |
| `docs/CHAOS_RUNBOOKS.md` | 124 | 2026-05-03 (`da5515271`) | KEEP | Chaos test playbook. |
| `docs/CI_CD_SECRETS.md` | 472 | 2026-05-09 (`63dfab3c6`) | KEEP | Secrets matrix, fresh. |
| `docs/CONTRIBUTING.md` | 215 | 2026-04-26 (`63cb5e6c5`) | KEEP | PR flow + branch protection. Slightly stale (16 days) but still valid. |
| `docs/DB_BACKUP_RESTORE.md` | 347 | 2026-05-01 (`2ffb695b2`) | KEEP | Backup/restore procedures. |
| `docs/DOCS_INDEX.md` | 134 | 2026-05-12 (`9471649db`) | KEEP | Index of indexes — the right entry point. Up to date. Minor: still says "ADR-001 supprimée" history but adequately explained. |
| `docs/GITHUB_ACTIONS_SHA_PINS.md` | 70 | 2026-05-01 (`e530303e3`) | KEEP | SHA pinning policy. |
| `docs/GOOGLE_PLAY_DATA_SAFETY.md` | 227 | 2026-03-23 (`43e0050aa`) | KEEP | Mobile store submission. Stale-looking date (50 days) but the content is reference material, not roadmap. |
| `docs/LINT_DISCIPLINE.md` | 52 | 2026-05-07 (`15d4dc3b8`) | KEEP | Extracted 2026-05-07. **CLAUDE.md lies about absence.** |
| `docs/MIGRATION_GOVERNANCE.md` | 103 | 2026-05-07 (`15d4dc3b8`) | KEEP | TypeORM migration rules. Exists despite CLAUDE.md being agnostic; CLAUDE.md actually correctly links it (line 168) — only TEST/LINT/ARCH are misclaimed. |
| `docs/MOBILE_INTERNAL_TESTING_FLOW.md` | 187 | 2026-03-23 (`7507c5f7a`) | KEEP | EAS internal testing flow. Stale-touch but content valid. |
| `docs/OPS_DEPLOYMENT.md` | 1159 | 2026-05-11 (`6eaa44bd6`) | KEEP-but-watch | Single-source-of-truth runbook. **1159 lines** — largest live doc. TOC handled (27 sections). Consider splitting at >1500. |
| `docs/PHASE_HISTORY.md` | 42 | 2026-05-12 (`9471649db`) | KEEP | Phase 8-13 consolidation. Phase 13 says "deferred to next sprint" — matches reality (chaos test still skipped per TD-5b). |
| `docs/RELEASE_CHECKLIST.md` | 655 | 2026-05-12 (`9471649db`) | KEEP | **Header says "Last updated: 2026-04-04 \| Sprint 6 complete \| 111/112 tasks"** despite the file being touched today. The header field is stale (lying), the body content is current. Edit needed: bump "Last updated" line. |
| `docs/ROADMAP_FE_RN_BEST_PRACTICES.md` | 121 | 2026-05-12 (`9471649db`) | KEEP | Sprint-rewritten. References deleted ADR-001 (line 112) explicitly with `git log` recovery — acceptable. |
| `docs/ROADMAP_PRODUCT.md` | 228 | 2026-05-12 (`9471649db`) | KEEP | Sprint-rewritten. References deleted ADR-001 at line 216 ("historique") — acceptable cross-ref to git history. |
| `docs/ROADMAP_TEAM.md` | 181 | 2026-05-12 (`9471649db`) | KEEP | Sprint-rewritten. |
| `docs/SLO.md` | 54 | 2026-05-01 (`00918e3d7`) | KEEP | SLO definitions. Small but load-bearing for ADR-026. |
| `docs/SOCIAL_AUTH_SETUP.md` | 203 | 2026-04-05 (`81810d98d`) | KEEP | Google/Apple OAuth setup. Reference material. |
| `docs/STORE_SUBMISSION_GUIDE.md` | 265 | 2026-03-26 (`84cba603f`) | KEEP | App Store + Google Play submission. Reference material. |
| `docs/TECH_DEBT.md` | 175 | 2026-05-12 (`9471649db`) | KEEP-bug | **Two `TD-5` entries** (one for `CHAT_ENRICHMENT_V2_ENABLED` bake at L101, second for `chaos-circuit-breaker.e2e` HALF_OPEN at L148). One must be renamed `TD-6` or `TD-5b`. |
| `docs/TEST_FACTORIES.md` | 48 | 2026-05-07 (`15d4dc3b8`) | KEEP | Extracted 2026-05-07. **CLAUDE.md lies about absence.** |
| `docs/UPTIME_MONITORING.md` | 64 | 2026-04-05 (`81810d98d`) | KEEP | Reference material. |

`docs/adr/` (41 files, all KEEP — sampled drift check):

| Path | LOC | Last touched | Class | Reason |
|---|---|---|---|---|
| `docs/adr/ADR-002-typeorm-1-0-mitigation.md` | 56 | 2026-05-03 | KEEP | TypeORM 1.0 watch — current. |
| `docs/adr/ADR-003-auth-route-split-deferred.md` | 64 | 2026-05-05 | KEEP | Deferred, status accurate. |
| `docs/adr/ADR-004-ios26-a18pro-crash-watch.md` | 50 | 2026-05-03 | KEEP | Active diag; companion to `museum-frontend/docs/IOS26_CRASH_DIAG.md`. Bug 2 still open per memory. |
| `docs/adr/ADR-006-ssrf-defense-in-depth.md` | 67 | 2026-04-30 | KEEP | SSRF mitigation, code-verified. |
| `docs/adr/ADR-007-coverage-gate-policy.md` | 50 | 2026-05-07 | KEEP | Status: Accepted-Implemented. Verified Phase 8. |
| `docs/adr/ADR-009-ota-disabled.md` | 55 | 2026-04-25 | KEEP-verified | Verified `museum-frontend/app.config.ts` has `updates: { enabled: false`. |
| `docs/adr/ADR-010-eslint-10-harmonize-deferred.md` | 80 | 2026-05-05 | KEEP | Deferred. |
| `docs/adr/ADR-011-rate-limit-fail-closed.md` | 55 | 2026-05-03 | KEEP-verified | Verified `rate-limit.middleware.ts:111` emits `rate_limit_redis_unavailable_failclosed`; `env.ts:198` has `failClosed: toBoolean(process.env.RATE_LIMIT_FAIL_CLOSED, isProduction)`. |
| `docs/adr/ADR-012-test-pyramid-taxonomy.md` | 63 | 2026-05-03 | KEEP | Test taxonomy rule. |
| `docs/adr/ADR-013-admin-facade-kept.md` | 47 | 2026-05-05 | KEEP-verified | Verified `mfa-gate.service.ts:52` cites ADR-013. |
| `docs/adr/ADR-014-mfa-all-roles-enforcement.md` | 69 | 2026-05-03 | KEEP | MFA scope decision. |
| `docs/adr/ADR-015-llm-judge-guardrail-v2.md` | 149 | 2026-05-12 | KEEP | Recently updated. References ADR-005 (deleted) — acceptable, gives history. |
| `docs/adr/ADR-016-mobile-cert-pinning-deferred.md` | 61 | 2026-05-05 | KEEP | Cross-references ADR-031 correctly. |
| `docs/adr/ADR-017-mfa-rn-wire-deferred.md` | 116 | 2026-05-12 | KEEP | Defer rationale. |
| `docs/adr/ADR-018-support-tickets-retention.md` | 53 | 2026-05-03 | KEEP | Retention policy. |
| `docs/adr/ADR-019-reviews-retention.md` | 48 | 2026-05-03 | KEEP | Retention policy. |
| `docs/adr/ADR-020-art-keywords-retention.md` | 51 | 2026-05-03 | KEEP | Retention policy. |
| `docs/adr/ADR-021-pgbouncer-transaction-mode.md` | 73 | 2026-05-03 | KEEP | PgBouncer mode decision. |
| `docs/adr/ADR-022-pg-read-replica-strategy.md` | 48 | 2026-05-03 | KEEP | Read replica strategy. |
| `docs/adr/ADR-023-redis-cluster-vs-sentinel.md` | 55 | 2026-05-03 | KEEP | Scale design. |
| `docs/adr/ADR-024-cloudflare-cdn-strategy.md` | 56 | 2026-05-03 | KEEP | Replaces deleted `CDN_CLOUDFLARE_SETUP.md`; **museum-web/README.md still links to the deleted file**. |
| `docs/adr/ADR-025-state-management-governance-mobile.md` | 51 | 2026-05-03 | KEEP | RN state governance. |
| `docs/adr/ADR-026-slo-observability-strategy.md` | 51 | 2026-05-03 | KEEP | SLO + obs strategy. |
| `docs/adr/ADR-027-sentry-rn-8.9.1-shipped.md` | 54 | 2026-05-12 | KEEP | Supersedes deleted ADR-008 with explicit `git log` recovery — clean. |
| `docs/adr/ADR-028-module-composition-singletons-deferred.md` | 103 | 2026-05-05 | KEEP | Deferred. |
| `docs/adr/ADR-029-documenter-sonnet-swap.md` | 68 | 2026-05-03 | KEEP | /team Documenter swap. |
| `docs/adr/ADR-030-llm-judge-budget-redis.md` | 70 | 2026-05-05 | KEEP | Redis budget. |
| `docs/adr/ADR-031-mobile-cert-pinning-kill-switch.md` | 86 | 2026-05-05 | KEEP | Amends ADR-016. |
| `docs/adr/ADR-032-typescript-monorepo-alignment.md` | 105 | 2026-05-12 | KEEP | TS version alignment. |
| `docs/adr/ADR-033-zod-status-quo-and-defer-plan.md` | 116 | 2026-05-12 | KEEP | Merged from ADR-033+034 on 2026-05-12. |
| `docs/adr/ADR-035-knowledge-base-wikidata.md` | 56 | 2026-05-07 | KEEP | KB Wikidata. |
| `docs/adr/ADR-036-llm-cache-strategy.md` | 120 | 2026-05-09 | KEEP | LLM cache single layer — verified by CLAUDE.md gotchas. |
| `docs/adr/ADR-037-visual-similarity-siglip-pgvector.md` | 97 | 2026-05-10 | KEEP | C3 SigLIP. |
| `docs/adr/ADR-038-anti-hallucination-citations-websearch.md` | 165 | 2026-05-11 | KEEP | C4 citations v2, status `Accepted-Implemented`. |
| `docs/adr/ADR-039-wikidata-resilient-circuit-breaker.md` | 141 | 2026-05-11 | KEEP | Wikidata CB. |
| `docs/adr/ADR-040-c3-image-comparative-full-deferred.md` | 28 | 2026-05-12 | KEEP | Defer stub. |
| `docs/adr/ADR-041-w1-walk-transitions-deferred.md` | 31 | 2026-05-12 | KEEP | Defer stub. |
| `docs/adr/ADR-042-voice-webrtc-streaming-deferred.md` | 34 | 2026-05-12 | KEEP | Defer stub. |
| `docs/adr/ADR-043-typeorm-drizzle-prisma-post-launch.md` | 37 | 2026-05-12 | KEEP | Defer stub. |
| `docs/adr/ADR-044-multi-tenant-museum-onboarding-deferred.md` | 31 | 2026-05-12 | KEEP | Defer stub — **README.md lies that multi-tenancy is supported**. |
| `docs/adr/ADR-045-shared-observability-package-extraction.md` | 37 | 2026-05-12 | KEEP | Defer stub. |
| `docs/adr/ADR-046-zod-4-be-migration-deferred.md` | 24 | 2026-05-12 | KEEP | Defer stub. |

`docs/RUNBOOKS/` :

| Path | LOC | Last touched | Class | Reason |
|---|---|---|---|---|
| `docs/RUNBOOKS/README.md` | 38 | 2026-05-07 | KEEP | Runbooks index. |
| `docs/RUNBOOKS/V1_FALLBACKS.md` | 193 | 2026-05-12 | KEEP | Operator fallback ops. Refs deleted `docs/V2_PENDING.md` with `git log` recovery — acceptable. |
| `docs/RUNBOOKS/audit-chain-forensics.md` | 96 | 2026-05-03 | KEEP | Forensics procedure. |
| `docs/RUNBOOKS/auto-rollback.md` | 99 | 2026-04-27 | KEEP | CI auto-rollback. |
| `docs/RUNBOOKS/CERT_ROTATION.md` | 83 | 2026-05-05 | KEEP | TLS cert rotation. |
| `docs/RUNBOOKS/prod-secrets-bootstrap.md` | 111 | 2026-04-27 | KEEP | Prod bootstrap. |
| `docs/RUNBOOKS/redis-rotation.md` | 89 | 2026-04-27 | KEEP | Redis rotation. |
| `docs/RUNBOOKS/secrets-rotation.md` | 96 | 2026-05-03 | KEEP | Secrets rotation. |

`docs/incidents/`, `docs/compliance/`, `docs/legal/`, `docs/security/` :

| Path | LOC | Last touched | Class | Reason |
|---|---|---|---|---|
| `docs/incidents/BREACH_PLAYBOOK.md` | 462 | 2026-04-26 | KEEP | GDPR 72h breach playbook. |
| `docs/incidents/POST_MORTEM_TEMPLATE.md` | 170 | 2026-04-26 | KEEP | Post-mortem template. |
| `docs/incidents/tabletop/db-compromise-sqli.md` | 153 | 2026-04-26 | KEEP | Tabletop. |
| `docs/incidents/tabletop/jwt-secret-leaked.md` | 157 | 2026-04-26 | KEEP | Tabletop. |
| `docs/incidents/tabletop/openai-key-abuse.md` | 160 | 2026-04-26 | KEEP | Tabletop. |
| `docs/compliance/DATA_FLOW_MAP.md` | 182 | 2026-04-26 | KEEP | Data flow map. |
| `docs/compliance/SUBPROCESSORS.md` | 93 | 2026-05-12 | KEEP | Subprocessor list, just updated. |
| `docs/legal/DPIA.md` | 205 | 2026-05-12 | KEEP | DPIA, DRAFT (per A.5 sprint output). |
| `docs/legal/ROPA.md` | 168 | 2026-05-12 | KEEP | ROPA Art. 30, DRAFT. |
| `docs/security/network-hardening.md` | 114 | 2026-04-12 | KEEP | Network hardening reference. Stale-touch (1 month) — verify still accurate before launch. |

`docs/_archive/` (24 files, **all ARCHIVE-as-is** — read-only by policy):

| Path | LOC | Last touched | Class | Reason |
|---|---|---|---|---|
| `docs/_archive/README.md` | 23 | 2026-05-12 | ARCHIVE | Archive policy doc, current. |
| `docs/_archive/audit-cleanup-2026-05-12/PROGRESS_A.md` | 86 | 2026-05-12 | ARCHIVE | Just-finished sprint A report (per task header, this is the just-archived old audit). KEEP location as archive — do not re-touch. |
| `docs/_archive/sprints/SPRINT_RECAP_2026-04-30_TO_2026-05-05.md` | 1403 | 2026-05-12 | ARCHIVE | Largest doc in repo; correctly archived 2026-05-12. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/README.md` | 124 | 2026-05-12 | ARCHIVE | Training index. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/01-bloc-1-banking-grade-hardening.md` | 680 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/02-cosign-slsa-compose-vps.md` | 318 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/03-audit-chain-slack.md` | 300 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/04-guardrails-juges-promptfoo-latence.md` | 279 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/05-cert-pinning-kill-switch.md` | 264 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/06-bloc-2-v12-orchestrator-supply-chain.md` | 386 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/07-bloc-3-architecture-hexagonale.md` | 329 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/08-bloc-4-walk-mode.md` | 242 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/09-bloc-5-personalization.md` | 261 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/10-bloc-6-data-hardening.md` | 274 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/11-bloc-6-retention.md` | 225 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/12-bloc-6-scale-infra.md` | 215 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/13-bloc-6-llm-cache.md` | 204 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/14-bloc-6-observability-slo.md` | 241 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/15-bloc-6-db-indexes-a1-a2.md` | 243 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/16-bloc-7-tests-phases-0-11.md` | 491 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/17-bloc-8-production-bugs.md` | 247 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/18-bloc-9-ios26-crash-instrumentation.md` | 193 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/19-bloc-10-typescript-strictness.md` | 209 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/20-bloc-11-documentation-roadmaps.md` | 255 | 2026-05-12 | ARCHIVE | French training. |
| `docs/_archive/training-2026-05/explications-sprint-2026-05-05/21-bloc-12-packages.md` | 259 | 2026-05-12 | ARCHIVE | French training. |

`docs/audit-2026-05-12/details/` (current audit — task says don't touch):

| Path | LOC | Class | Reason |
|---|---|---|---|
| `docs/audit-2026-05-12/details/01-typing.md` | 159 | KEEP | Current audit output. |
| `docs/audit-2026-05-12/details/02-code-quality.md` | 233 | KEEP | Current audit output. |
| `docs/audit-2026-05-12/details/03-dry.md` | 378 | KEEP | Current audit output. |
| `docs/audit-2026-05-12/details/04-kiss.md` | 510 | KEEP | Current audit output. |
| `docs/audit-2026-05-12/details/05-architecture-triple.md` | 416 | KEEP | Current audit output. |
| `docs/audit-2026-05-12/details/06-architecture-organization.md` | 368 | KEEP | Current audit output. |

**Root + per-app:**

| Path | LOC | Last touched | Class | Reason |
|---|---|---|---|---|
| `CLAUDE.md` | 292 | unstaged | KEEP-fix-required | Sources of lies #1, #2, #4 (see drift section). |
| `AGENTS.md` | 60 | unstaged | KEEP | Pointer to CLAUDE.md + gitnexus auto-inject — minimal duplication. |
| `README.md` | 165 | 2026-04-21 (`3d8658a8f`) | KEEP-fix-required | Source of lies #3, #5 (see drift section). Last touched 22 days ago. |
| `museum-backend/README.md` | 231 | recent | KEEP | API surface table accurate-ish, but **lists `POST /api/chat/sessions/:id/messages/stream` (SSE)** while SSE is deprecated per ADR-001 (deleted). Either drop the row or note "deprecated, still exposed". |
| `museum-frontend/README.md` | 55 | recent | KEEP-fix-required | **L48** "See docs/QUALITY_GUIDE.md" — file deleted today. **L52** "Architecture map — docs/ARCHITECTURE_MAP.md" — file deleted today. Both per DOCS_INDEX history. |
| `museum-web/README.md` | 61 | recent | KEEP-fix-required | **L61** "CDN / Cloudflare — ../docs/CDN_CLOUDFLARE_SETUP.md" — file deleted 2026-05-07. Should link to ADR-024 instead. |
| `museum-backend/docs/rbac-matrix.md` | 47 | recent | KEEP | DOCS_INDEX explicitly says RBAC matrix is "not yet extracted" but this file DOES exist. Cross-reference fix needed in DOCS_INDEX. |
| `museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.md` | 89 | 2026-04-30 | KEEP | One-off perf analysis. Could move to `_archive/perf/` after 30 days. |
| `museum-frontend/docs/IOS26_CRASH_DIAG.md` | 133 | recent | KEEP | Active diag companion to ADR-004. |

**Repo root miscellany (audit working files — not under `docs/`):**

| Path | LOC | Class | Reason |
|---|---|---|---|
| `PROGRESS_B.md` | 43 | DELETE-after-audit | Untracked sprint progress file at repo root. Should move to `docs/audit-2026-05-12/details/` or `docs/_archive/audit-cleanup-2026-05-12/` after sprint close. |
| `PROGRESS_C.md` | 97 | DELETE-after-audit | Same. |
| `PROGRESS_D.md` | 69 | DELETE-after-audit | Same. References `.claude/tasks` which doesn't exist. |

## Top dead docs (DELETE candidates)

None inside `docs/`. The doc tree was just cleaned (2026-05-12 sprint). The 3 `PROGRESS_*.md` at repo root are working files that should be moved or deleted post-sprint — they're already untracked.

## Top duplicated content blocks (FOLD candidates)

1. **GitNexus block duplicated verbatim in `CLAUDE.md` (L250-292) and `AGENTS.md` (L18-60)** — auto-injected by `npx gitnexus analyze` (gotcha documented in CLAUDE.md L135). This is **intentional dual-injection** to support both Claude Code (reads `CLAUDE.md`) and other agents (read `AGENTS.md`), so technically FOLD is impossible without changing the tooling. Accept duplication; mark as known.
2. **Test discipline rules**: `CLAUDE.md` § Test Discipline (L202-212) duplicates a "quick reference" subset of `docs/TEST_FACTORIES.md`. CLAUDE.md says the file is "pas encore extrait" — false. **FOLD**: Drop the quick reference from CLAUDE.md (or shrink to 2 lines + link), let TEST_FACTORIES.md own the content.
3. **ESLint discipline rules**: `CLAUDE.md` § ESLint Discipline (L214-223) duplicates `docs/LINT_DISCIPLINE.md`. Same fold opportunity.
4. **Architecture summary**: `CLAUDE.md` § Architecture (L98-105) duplicates the intro of `docs/ARCHITECTURE.md`. **FOLD**: Replace CLAUDE.md section with `See docs/ARCHITECTURE.md`.
5. **Setup commands**: `museum-backend/README.md`, `museum-frontend/README.md`, `museum-web/README.md` all duplicate the same install/dev/lint/test command tables that already live in `CLAUDE.md` § Common Commands. Acceptable for newcomers but slowly drifts (e.g., `museum-frontend/README.md` cites `--max-warnings=22` magic number that's not in CLAUDE.md).
6. **Voice pipeline**: `CLAUDE.md` § Voice V1 (L189-200) is a summary of `docs/AI_VOICE.md`. Acceptable summary, but it explicitly says "ADR-001 supprimée 2026-05-03" — the same wording appears in `AI_VOICE.md` L5. Minor.
7. **Team reports lifecycle**: `CLAUDE.md` § Team reports lifecycle (L225-237) duplicates `team-reports/README.md` + `.claude/skills/team/team-reports/README.md`. Three places say the same thing.
8. **Migration governance**: `CLAUDE.md` § Migration Governance (L166-173) is correctly a "quick reference + link" pattern — good model for the others.

## Doc-vs-code drift (lying docs)

1. **`CLAUDE.md:100`** says `> docs/ARCHITECTURE.md is referenced in older docs but not yet extracted`. **LIE**: `docs/ARCHITECTURE.md` exists (128 lines, header `extracted 2026-05-07`).
2. **`CLAUDE.md:206`** says `Le doc séparé docs/TEST_FACTORIES.md est référencé mais pas encore extrait`. **LIE**: file exists (48 lines, header `extracted 2026-05-07`).
3. **`CLAUDE.md:218`** says `Le doc séparé docs/LINT_DISCIPLINE.md est référencé mais pas encore extrait`. **LIE**: file exists (52 lines, header `extracted 2026-05-07`).
4. **`CLAUDE.md:28`** says `Post-2026-04-20 runtime tracking : .claude/tasks/ + .claude/skills/team/team-reports/`. **LIE**: `.claude/tasks/` directory does not exist (verified by `ls`). Only `.claude/skills/team/team-reports/` exists.
5. **`README.md:61` + `README.md:147`** reference ADR-001 (deleted 2026-05-03 per `DOCS_INDEX.md`). README says "SSE streaming deprecated — see ADR-001" but ADR-001 is gone; recovery only via `git log`. UX problem for new readers.
6. **`README.md:149` ("Multi-tenancy support")** contradicts **ADR-044** which explicitly defers multi-tenant museum onboarding to V1.1.
7. **`README.md:73`** says `git clone https://github.com/<your_repo>/musaium.git` — placeholder URL never replaced.
8. **`museum-frontend/README.md:48`** links to `docs/QUALITY_GUIDE.md` — DELETED 2026-05-12 per `DOCS_INDEX.md:126` (`museum-frontend/docs/{ARCHITECTURE_MAP,QUALITY_GUIDE,NEXT_LEVEL_MOBILE_PRODUCTION_AND_TEST}.md supprimés`). Dead link.
9. **`museum-frontend/README.md:52`** links to `docs/ARCHITECTURE_MAP.md` — DELETED 2026-05-12. Dead link.
10. **`museum-web/README.md:61`** links to `../docs/CDN_CLOUDFLARE_SETUP.md` — DELETED 2026-05-07 per `DOCS_INDEX.md:127`. Dead link; should point to `docs/adr/ADR-024-cloudflare-cdn-strategy.md`.
11. **`docs/TECH_DEBT.md`** has **two `TD-5` entries** — L101 (`CHAT_ENRICHMENT_V2_ENABLED` bake) and L148 (`chaos-circuit-breaker.e2e` HALF_OPEN). One must be renamed (e.g., `TD-6`). Comment system + future closure script will be ambiguous.
12. **`docs/RELEASE_CHECKLIST.md:2`** header says `Last updated: 2026-04-04 | Sprint 6 complete | Overall: 111/112 tasks (99%)`. **Stale**: file was touched today (`9471649db`), content is current to launch prep — only the header field is out of date.
13. **`docs/DOCS_INDEX.md:35`** says `RBAC matrix (backend) | ... matrix not yet extracted to its own doc`. **LIE**: `museum-backend/docs/rbac-matrix.md` exists (47 lines).
14. **`museum-backend/README.md:50`** documents `POST /api/chat/sessions/:id/messages/stream` (SSE streaming) which is "@deprecated" per CLAUDE.md but still listed without deprecation marker. Either drop or mark `(deprecated, SSE removed)`.
15. **`docs/_archive/audit-cleanup-2026-05-12/PROGRESS_A.md`** flagged by task header as "just-archived old audit". File is exactly that — properly archived under `_archive/`. The archive location is correct; flag is moot unless task wants it deleted (do not delete — sprint memory).

## Missing docs the project actually needs

- **`docs/ARCHITECTURE.md` for `museum-web`** is thin — only 13 lines in the file describe Web vs 39 for Backend and 26 for Frontend. Web admin panel = production surface, deserves more.
- **No CHANGELOG.md anywhere.** Releases are tracked in `RELEASE_CHECKLIST.md` (which lies about "Sprint 6 complete") and via git tags only. Pre-launch V1 acceptable; post-launch will need one for App Store reviews.
- **No `docs/ONBOARDING.md`** for new contributors. README + CLAUDE.md + AGENTS.md scatter the info. A new dev's first 30 minutes are wasted reconciling 3 entry points.
- **No `docs/API.md`** — `museum-backend/README.md` has the endpoint table; could be either KEEP there or a single `docs/API_SURFACE.md`. Currently it lives in 2 places (the README + the OpenAPI spec). OpenAPI is source of truth; the README table is a duplicated curation that drifts.
- **No top-level `SECURITY.md`** at repo root (GitHub convention). `docs/security/network-hardening.md` exists but isn't surfaced where GitHub looks for vuln-disclosure policy.

## CLAUDE.md / AGENTS.md weight

- `CLAUDE.md`: 292 lines / 20 KB. **Too much for primary agent context**. Sections that could collapse:
  - § Architecture (L98-105) → 2-line pointer to `docs/ARCHITECTURE.md`.
  - § Test Discipline (L202-212) → 2-line pointer to `docs/TEST_FACTORIES.md`.
  - § ESLint Discipline (L214-223) → 2-line pointer to `docs/LINT_DISCIPLINE.md`.
  - § Voice V1 (L189-200) → 2-line pointer to `docs/AI_VOICE.md`.
  - § Team reports lifecycle (L225-237) → 2-line pointer to `team-reports/README.md`.
  - Estimated savings: ~80 lines (~27% reduction).
- **Dead references in `CLAUDE.md`**: 3 "not yet extracted" lies (above) + `.claude/tasks/` non-existent dir.
- `AGENTS.md`: 60 lines / 3.3 KB. Mostly intentional gitnexus block. Clean. Pointer-only pattern works.
- **Honesty paragraph (UFR-013, L152-164)** is itself an excellent example of what `CLAUDE.md` should keep — verifiable, rule-shaped, code-grounded.

## Recommendations (action plan)

Ranked by ROI for a solo dev pre-launch (low effort, high signal).

1. **[5 min, high]** `CLAUDE.md` L100 + L206 + L218: delete "not yet extracted" sentences. Replace with `See docs/ARCHITECTURE.md` / `docs/TEST_FACTORIES.md` / `docs/LINT_DISCIPLINE.md`. CLAUDE.md L28: remove `.claude/tasks/` reference (or create the dir if intent is to use it).
2. **[10 min, high]** `README.md`: fix the placeholder repo URL (L73), remove ADR-001 mentions (L61, L147), strike "Multi-tenancy support" (L149) or note "deferred to V1.1 — see ADR-044".
3. **[5 min, high]** `museum-frontend/README.md` L48 + L52: remove dead links to `QUALITY_GUIDE.md` and `ARCHITECTURE_MAP.md`. Replace with `See docs/TEST_FACTORIES.md` and `See docs/ARCHITECTURE.md § Frontend`.
4. **[5 min, high]** `museum-web/README.md` L61: replace `CDN_CLOUDFLARE_SETUP.md` link with `docs/adr/ADR-024-cloudflare-cdn-strategy.md`.
5. **[2 min, high]** `docs/TECH_DEBT.md`: rename second `TD-5` to `TD-6`.
6. **[2 min, high]** `docs/RELEASE_CHECKLIST.md` L2: bump header from `Last updated: 2026-04-04 | Sprint 6 complete | 111/112` to today's date + true count.
7. **[5 min, med]** `docs/DOCS_INDEX.md` L35: update RBAC matrix entry to point to `museum-backend/docs/rbac-matrix.md` (which exists).
8. **[5 min, med]** `museum-backend/README.md` L50: mark SSE streaming row as `(deprecated, replaced by sync chat)` or drop it.
9. **[20 min, med]** After all the above, run a final pass: `grep -rln "ADR-001\|ADR-005\|ADR-008\|ADR-034" docs/ museum-*/README.md` — every remaining hit must have explicit "deleted, recover via git log" context.
10. **[30 min, low]** Consider splitting `docs/OPS_DEPLOYMENT.md` (1159 LOC) — it has 27 sections, anchor TOC, and works today but is at the edge of comfortable single-file size. Defer to post-launch.
11. **[15 min, low]** Move `PROGRESS_B.md / PROGRESS_C.md / PROGRESS_D.md` from repo root to `docs/audit-2026-05-12/details/` (or delete after sprint close).
12. **[1 line, low]** Add a top-level `SECURITY.md` stub at repo root for GitHub disclosure-policy convention.

---

## Honest summary (5 lines)

- Doc signal/noise: **72/100**. Onboarding clarity: **58/100**. Doc-vs-code drift: **22/100** (lower = aligned).
- **Total: KEEP 119 / FOLD 9 / ARCHIVE 24 / DELETE 0** (`docs/` tree only; root `PROGRESS_*.md` × 3 = move/delete after sprint).
- The doc that lies most aggressively about reality: **`CLAUDE.md`** itself — it tells every new agent 3 times that `docs/ARCHITECTURE.md`/`docs/TEST_FACTORIES.md`/`docs/LINT_DISCIPLINE.md` are "not yet extracted" while those files have existed for 5 days, and it points to a `.claude/tasks/` runtime tracker that does not exist on disk.
