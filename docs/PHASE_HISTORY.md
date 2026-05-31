# Phase History — test / quality hardening

Consolidated chronology of cross-cutting test, quality, and observability phases. Each phase is a multi-week effort that produced ADRs, CI workflow changes, or coverage gates. Detailed plans / recaps live in `git log` (search by phase keyword).

When a phase wraps, summarize it here in 3-5 lines and link the resulting ADRs. Don't keep ephemeral plan documents in `docs/plans/` after completion.

## Phase 8 — Coverage gate policy (2026-04)

Coverage ratchet policy formalized. ADR-007 flipped Proposed → Accepted. Per-module thresholds enforced in CI; baseline JSON tracked alongside tier baselines.

- ADR-007 — coverage gate policy

## Phase 9 — Auth e2e + Maestro mobile (2026-04 / 2026-05)

Mobile e2e via Maestro added in CI matrix (4 Android shards + iOS nightly cron). Auth happy-path + failure paths covered. Mobile internal testing flow documented.

- `.maestro/shards.json` defines the 4 Android shards
- `docs/MOBILE_INTERNAL_TESTING_FLOW.md`

## Phase 10 — Web a11y + Lighthouse CI (2026-05)

Lighthouse CI gate on PR for `museum-web`. Critical pages (landing, /admin/login) must score ≥90 on a11y + best-practices. Audited via `pnpm lhci autorun`.

## Phase 11 — Banking-grade hardening (2026-04-30 → 2026-05-05)

Multi-block sprint covering supply-chain (cosign + SLSA), audit-chain Slack alerts, LLM guardrails (judge v2 + promptfoo), cert pinning kill-switch, hexagonal architecture refactor, observability SLOs, LLM cache strategy, retention policies.

ADRs produced: ADR-014 (MFA all roles), ADR-015 (LLM-judge guardrail v2), ADR-018/019/020 (retention), ADR-021-024 (scaling design), ADR-026 (SLO observability), ADR-030 (LLM-judge budget redis), ADR-036 (LLM cache).

Debrief pédagogique 2026-04-30→05-05 (en git history, supprimé du tree 2026-05-20).

## Phase 12 — Stryker mutation testing — banking-grade hit (2026-05-08 → 2026-05-11, audit-corrected 2026-05-14)

Stryker incremental rollout per-module config (shared-db, shared-http, module-auth-totp, etc.). Autonomous night run 2026-05-10 → 2026-05-11 produced **0 survivors / 4067 covered mutants / 100.00 % mutation score on covered code** (classical Stryker formula counting 481 NoCoverage as undetected = 89.42 %). The **`99.75 %` figure originally posted here was not reproducible** from any committed artifact — corrected by audit `2026-05-14 verification batch`.

Subsequent cleanup commit `07aea6ef` (chore: Stryker survivor cleanup — review/support/auth/email + 4 module configs) refreshed the per-module configs ; current `reports/stryker-incremental.json` (mtime 2026-05-14 11:42) reports **Killed=1387 / Timeout=3190 / Survived=28 / NoCoverage=298 / Ignored=701 / RuntimeError=9 (total 5613)**, i.e. **classical = 93.35 % ; covered-only = 99.39 %**. The 28 survivors are the next-sprint mutation backlog. *(Note: `reports/stryker-incremental.json` is no longer committed — these figures are a 2026-05-14 historical snapshot, not reproducible on the current tree. Audit 360 dim.1.)*

> **⚠️ Status 2026-05-31 (audit 360 dim.1+8 correction) — mutation gate DISABLED, not enforcing.** The `mutation` job in `ci-cd-backend.yml` is `if: false` (since 2026-05-09). **No Stryker run — nightly, push, or PR — currently executes**, so the per-hot-file thresholds in `museum-backend/.stryker-hot-files.json` are **NOT enforced in CI**. The earlier wording here ("CI nightly continues to enforce per-hot-file thresholds" / "Mutation score per hot file enforced in CI nightly") was stale/false and is retracted. The gate logic (`stryker-hot-files-gate.mjs`, `process.exit(1)`) is real but un-armed. Re-arming = regenerate the incremental cache offline, then remove `if: false`; deferred post-launch (out of the J-7 scope).

Banking-grade hot files config: `museum-backend/.stryker-hot-files.json` (chat schemas, auth, llm-judge guardrail, sanitizePromptInput) — kept for the re-arm, **currently not run** (see status note above).

Commits: `daa3ef20` (final 0 survivors on shared/* + module-auth-totp), prior chunks `1604478c` (shared-db), `969a5ca5` (shared-http).

## Phase 13 — Chaos circuit breaker e2e (deferred to next sprint)

`tests/e2e/chaos-circuit-breaker.e2e.test.ts` skipped pending coordination with the LLMCircuitBreaker / opossum refactor. Activation tracked as a TECH_DEBT entry.

## Phase 14 — Garak REST swap (2026-05-14)

ADR-049 §Rollout Phase 1.5 closed ahead of schedule. `llm-security-garak.yml` swapped from a `huggingface.Pipeline` (Phi-3-mini-4k-instruct) baseline target to a `rest` generator pointed at the live Musaium chat endpoint (`POST /api/chat/sessions/:id/messages`), booted in-job via pgvector + Redis service containers (same pattern as `llm-security-promptfoo.yml`). Probe set widened 3 → 6 (`promptinject,leakreplay,encoding,dan,tap,xss`) — closes audit gaps G2 (multi-turn via `dan` + `tap`) and G4 (encoding bypass) from `2026-05-14-verification-batch`. Session-per-probe freshness loop prevents history contamination. New `Content check` step defends against silent JSON-shape drift; severity-eval Python widened to multi-report glob. `--parallel_attempts=1`. Known coverage gap deferred to Phase 2: LLM Guard sidecar not deployed in CI (same gap in promptfoo).

Run: `2026-05-14-garak-musaium-rest-swap`. New file: `museum-backend/scripts/llm-security/musaium-garak-rest.json`. ADR-049 changelog footer + STATUS.md row updated at merge.

> **Reverted 2026-05-17** (commit `cc17254db`) — `llm-security-garak.yml` + `musaium-garak-rest.json` **deleted**. Real cost ~$120/mo (256 prompts × 6 probes × ~18s/call full orchestrator → ~8h wall-clock + ~$30 OpenAI tokens × 4 runs) vs $2/mo estimate. Deferred to V2.1 once an LLM Guard sidecar in CI permits a fast-path target without the full orchestrator. Cf. ADR-049 amendment 2026-05-17 + CLAUDE.md § CI. promptfoo (`llm-security-promptfoo.yml`) remains the active OWASP LLM07 gate.

## Phase 15 — Maestro Phase 1 + UFR-021 screen-test coverage (2026-05-17)

Maestro flow inventory expanded (11 flows) + UFR-021 screen-test-coverage sentinel introduced — every new/modified user-facing screen must ship with a Maestro flow exercising its critical happy path; Jest component tests no longer sufficient (DOB-2026-05-17 regex regression). 50 % screen coverage reached at phase close.

- Sentinel: `pnpm sentinel:screen-test-coverage` ; grandfather baseline `museum-frontend/.maestro/coverage-baseline.json` (removals only)
- Specs: `docs/TESTING_DISCIPLINE_PROPOSAL.md`, `docs/TEST_COVERAGE_INVENTORY.md`, `docs/TESTING_PHASE2_PLAN.md`
- Commit: `70f5ce2f` (Maestro Phase 1 + UFR-021 sentinel)

## Phase 16 — Distributed tracing W3/W4 + cert-pinning cluster 9 (2026-05-17 → 2026-05-19)

Header-based BE↔FE trace propagation wired (`trace-propagation.middleware.ts`, mounted `app.ts:103`); CORS allowedHeaders extended with `sentry-trace` + `baggage`. Sentry+OTel SDK v2 coexistence settled (`skipOpenTelemetrySetup: true` + `getDefaultIntegrationsWithoutPerformance()`; no `@sentry/opentelemetry` bridge — TD-SN-01 STALE-BY-DESIGN). Mobile cert-pinning cluster 9 hardening (TD-SSL-01..05). Typo `tracee→tracePropagationMiddleware` fixed.

- `docs/observability/DISTRIBUTED_TRACING.md`, `docs/HANDOFF-2026-05-19-debt-collision-report.md`
- Commits: `d06bfd54` (Sentry/OTel cleanup), `d041ed83` (rename + TD-52/53), `0c256191` (cert pinning cluster 9)

## Phase 17 — UFR-022 fresh-context 5-phase /team pipeline (2026-05-18)

`/team` orchestrator reworked to a single mandatory 5-phase fresh-context pipeline (spec → plan → red → green → review), each phase a fresh agent spawn reading prior artifacts from disk only. Frozen-test byte-for-byte (`post-edit-green-test-freeze.sh`), mandatory lib-docs consultation, `BRIEF-ACK` + `BLOCK-CONTEXT-LEAK` self-defense, unlimited reviewer rejection loop. Mode selector + bypass keywords removed.

- Spec: `docs/superpowers/specs/2026-05-18-ufr-022-fresh-context-five-phases-design.md` ; rule `UFR-022`
- Commit: `5a01f5ca` (UFR-022 fresh-context 5-phase + mode unique + lib-docs cache)
