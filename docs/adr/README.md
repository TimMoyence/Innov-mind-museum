# ADR Index — Musaium

52 architecture decision records present in `docs/adr/`. Click an entry to open the full ADR.

**Status legend** : `ACCEPTED` (implemented or design-locked) · `PROPOSED` (not yet ratified) · `DEFERRED` (post-launch / V1.1) · `SUPERSEDED` (replaced — see pointer) · `ACTIVE-MONITORING` (operational watch, no code change) · `REVERTED` (rolled back, kept for record).

Numbering gaps : **ADR-001, ADR-005, ADR-008, ADR-034** were deleted from `docs/adr/` (intentional removals, e.g. ADR-008 superseded by ADR-027 and file deleted 2026-05-03). Recover any deleted ADR via `git log --diff-filter=D -- docs/adr/` then `git show <sha>^:docs/adr/<file>`.

## By status (quick count)

- ACCEPTED (incl. Accepted-Implemented / Amended) : **36**
- DEFERRED : **9**
- PROPOSED : **4**
- SUPERSEDED : **2**
- ACTIVE-MONITORING : **1**

## Full table

| ADR | Title | Status | Notes |
|---|---|---|---|
| [ADR-002](ADR-002-typeorm-1-0-mitigation.md) | TypeORM 1.0 mitigation | PROPOSED | 2026-04-20 |
| [ADR-003](ADR-003-auth-route-split-deferred.md) | Auth route split | DEFERRED | 2026-04-20 |
| [ADR-004](ADR-004-ios26-a18pro-crash-watch.md) | iOS 26 / A18 Pro production crash watch | ACTIVE-MONITORING | 2026-04-20 |
| [ADR-006](ADR-006-ssrf-defense-in-depth.md) | SSRF defense-in-depth for html-scraper | ACCEPTED | Implemented before 2026-04-30 |
| [ADR-007](ADR-007-coverage-gate-policy.md) | Coverage gate CI policy | ACCEPTED | Implemented Phase 8 2026-05-04 |
| [ADR-009](ADR-009-ota-disabled.md) | OTA (expo-updates) disabled by design | ACCEPTED | |
| [ADR-010](ADR-010-eslint-10-harmonize-deferred.md) | ESLint 10 harmonization across the monorepo | DEFERRED | Re-confirmed 2026-05-05 |
| [ADR-011](ADR-011-rate-limit-fail-closed.md) | Rate-Limit fail-closed when Redis is down | ACCEPTED | |
| [ADR-012](ADR-012-test-pyramid-taxonomy.md) | Test Pyramid Taxonomy | ACCEPTED | 2026-04-30 |
| [ADR-013](ADR-013-admin-facade-kept.md) | Admin facade is kept (not dropped) | ACCEPTED | 2026-04-30 |
| [ADR-014](ADR-014-mfa-all-roles-enforcement.md) | MFA Enforcement: All Enrolled Users (not Admin-Only) | ACCEPTED | |
| [ADR-015](ADR-015-llm-judge-guardrail-v2.md) | Chat Guardrail v2: LLM Judge Layer + Multilingual Insults | ACCEPTED | Amended 2026-05-14 — `GUARDRAILS_V2_CANDIDATE` retired; V2 layers run in parallel |
| [ADR-016](ADR-016-mobile-cert-pinning-deferred.md) | Mobile Cert Pinning: library selected, production wire-up | DEFERRED | See ADR-031 for kill-switch |
| [ADR-017](ADR-017-mfa-rn-wire-deferred.md) | MFA RN wire (E2) | DEFERRED | Post-launch + 30 days, re-confirmed 2026-05-05 |
| [ADR-018](ADR-018-support-tickets-retention.md) | `support_tickets` retention policy | ACCEPTED | |
| [ADR-019](ADR-019-reviews-retention.md) | `reviews` retention policy | ACCEPTED | |
| [ADR-020](ADR-020-art-keywords-retention.md) | `art_keywords` retention policy | ACCEPTED | |
| [ADR-021](ADR-021-pgbouncer-transaction-mode.md) | PgBouncer transaction mode for backend → Postgres | ACCEPTED | Design — provisioning deferred to ops |
| [ADR-022](ADR-022-pg-read-replica-strategy.md) | PostgreSQL read replica strategy | ACCEPTED | Design — provisioning deferred to ops |
| [ADR-023](ADR-023-redis-cluster-vs-sentinel.md) | Redis cluster (not Sentinel) for cache + BullMQ | ACCEPTED | Design — provisioning deferred to ops |
| [ADR-024](ADR-024-cloudflare-cdn-strategy.md) | Cloudflare CDN for static assets + landing/admin | ACCEPTED | Design — account provisioning deferred to ops |
| [ADR-025](ADR-025-state-management-governance-mobile.md) | State Management Governance (museum-frontend) | ACCEPTED | |
| [ADR-026](ADR-026-slo-observability-strategy.md) | SLO + Observability Strategy | ACCEPTED | |
| [ADR-027](ADR-027-sentry-rn-8.9.1-shipped.md) | Sentry React Native 8.7 → 8.9.1 shipped | ACCEPTED | 2026-04-30. Supersedes deleted ADR-008 |
| [ADR-028](ADR-028-module-composition-singletons-deferred.md) | Module composition singletons (F6) | DEFERRED | Confirmed 2026-05-05 |
| [ADR-029](ADR-029-documenter-sonnet-swap.md) | Documenter agent swap to Sonnet 4.6 | REVERTED | Reverted 2026-05-14 |
| [ADR-030](ADR-030-llm-judge-budget-redis.md) | LLM-judge daily budget store: Redis SET+TTL | ACCEPTED | 2026-05-05 |
| [ADR-031](ADR-031-mobile-cert-pinning-kill-switch.md) | Mobile cert pinning kill-switch architecture | ACCEPTED | Scaffold landed; activation pending real SPKI capture |
| [ADR-032](ADR-032-typescript-monorepo-alignment.md) | TypeScript version alignment across the monorepo | ACCEPTED | 2026-05-05 |
| [ADR-033](ADR-033-zod-status-quo-and-defer-plan.md) | zod status quo + post-launch unification plan | SUPERSEDED | 2026-05-12 — superseded by sprint audit-cleanup B.8 (`f3d25317`) |
| [ADR-035](ADR-035-knowledge-base-wikidata.md) | Knowledge Base Wikidata enrichment for chat prompts | ACCEPTED | Always-on since 2026-04-19 |
| [ADR-036](ADR-036-llm-cache-strategy.md) | LLM cache strategy (single-source consolidation) | ACCEPTED | PR-A + PR-B merged 2026-05-08 |
| [ADR-037](ADR-037-visual-similarity-siglip-pgvector.md) | Visual similarity (C3) — SigLIP encoder + pgvector kNN | ACCEPTED | Sprint 2026-05-08 → 2026-05-10 |
| [ADR-038](ADR-038-anti-hallucination-citations-websearch.md) | Anti-hallucination via Citations Schema v2 + WebSearch fallback | ACCEPTED | Merged `c72ec2ba` 2026-05-11 |
| [ADR-039](ADR-039-wikidata-resilient-circuit-breaker.md) | Wikidata resilient (C5) — opossum circuit-breaker + local-dump fallback | ACCEPTED | C5.3 Phase A+B merged 2026-05-11 |
| [ADR-040](ADR-040-c3-image-comparative-full-deferred.md) | C3 image comparative full UI | DEFERRED | V1.1 |
| [ADR-041](ADR-041-w1-walk-transitions-deferred.md) | W1 walk transitions (multi-POI proactive) | DEFERRED | V1.1 |
| [ADR-042](ADR-042-voice-webrtc-streaming-deferred.md) | Voice WebRTC realtime streaming | DEFERRED | V1.1 |
| [ADR-043](ADR-043-typeorm-drizzle-prisma-post-launch.md) | TypeORM → Drizzle / Prisma migration | DEFERRED | Post-launch H2 2026 |
| [ADR-044](ADR-044-multi-tenant-museum-onboarding-deferred.md) | Multi-tenant museum onboarding (W2) | DEFERRED | V1.1 |
| [ADR-045](ADR-045-shared-observability-package-extraction.md) | `@musaium/shared/observability` extraction (sentry scrubber + helpers) | DEFERRED | Amendment governs Sentry+OTel state-cible (cf. CLAUDE.md gotcha) |
| [ADR-046](ADR-046-zod-4-be-migration-deferred.md) | Zod 4 BE migration | SUPERSEDED | 2026-05-12 — shipped same sprint as stub (`f3d25317`) |
| [ADR-047](ADR-047-llm-guard-circuit-breaker-fail-closed.md) | LLM Guard circuit breaker preserves fail-CLOSED unconditionally | ACCEPTED | 2026-05-12 |
| [ADR-048](ADR-048-guardrail-strategy-interface.md) | Guardrail strategy interface — `GuardrailProvider` as perennial port | PROPOSED | Becomes Accepted on Phase 0 commit |
| [ADR-049](ADR-049-llm-security-ci-gates.md) | LLM security CI gates: Garak + promptfoo | ACCEPTED | Amended 2026-05-17 — Garak deferred V2.1, promptfoo only |
| [ADR-050](ADR-050-accept-langfuse-v3-eol.md) | Accept langfuse v3 EOL until 2026-09-01 | ACCEPTED | |
| [ADR-051](ADR-051-oss-guardrail-providers-ready.md) | OSS GuardrailProvider adapters ready (Presidio + Llama Prompt Guard 2) — not activated | ACCEPTED | |
| [ADR-052](ADR-052-user-suspend-softdelete.md) | User suspend + soft-delete strategy for admin user management | ACCEPTED | |
| [ADR-053](ADR-053-apple-5-1-2-i-granular-consent.md) | Apple Guideline 5.1.2(i) granular third-party AI consent | ACCEPTED | Implemented 2026-05-16, backend `v1.2.3` |
| [ADR-054](ADR-054-audit-chain-merkle-batch-redesign.md) | Audit chain redesign: Merkle batch chain replaces per-row hash chain | PROPOSED | Cf. CLAUDE.md gotcha on 50–200 INSERT/s cap |
| [ADR-055](ADR-055-bottomsheet-router-state-machine.md) | BottomSheetRouter: in-house state machine over `@gorhom/bottom-sheet` | ACCEPTED | Implemented |
| [ADR-056](ADR-056-a5-phase-client-side-simulated.md) | Chat pipeline phase: client-side simulated, not BE-streamed | ACCEPTED | Implemented |
| [ADR-057](ADR-057-webauthn-rp-id-decision-deferred.md) | WebAuthn admin RP ID decision | DEFERRED | V1.1 |
| [ADR-058](ADR-058-selective-hexagonal-ports-policy.md) | Selective hexagonal ports: keep multi-impl ports, inline single-impl ports | PROPOSED | |
| [ADR-059](ADR-059-connectivity-single-source-online-manager-bridge.md) | Connectivity single source of truth + `onlineManager` bridge as `queryClient.ts` module side-effect | ACCEPTED | Implemented |
| [ADR-060](ADR-060-gdpr-erasure-dsar-compliance-chain.md) | GDPR Art.17 erasure chain (audio/image/Brevo) + S3 orphan-purge cron + Art.15 DSAR export schemaVersion 2 | ACCEPTED | Implemented |

## Cross-reference sanity check vs CLAUDE.md

ADRs cited in `CLAUDE.md` are present in this index: ADR-015, ADR-021, ADR-036, ADR-037, ADR-045, ADR-047, ADR-049, ADR-050, ADR-051, ADR-052, ADR-054.

## Maintenance

- Add a row when shipping a new `ADR-NNN-*.md`.
- Flip status here at the same commit that flips status in the ADR file.
- When superseding, write `SUPERSEDED · superseded by ADR-XXX (<sha>)` in the Notes column.
- Keep the gap list (001/005/008/034) updated if more files are deleted.
