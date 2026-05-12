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

Debrief (training material): `docs/_archive/training-2026-05/explications-sprint-2026-05-05/` (22 fichiers, 6239L).

## Phase 12 — Stryker mutation testing — banking-grade hit (2026-05-08 → 2026-05-11)

Stryker incremental rollout per-module config (shared-db, shared-http, module-auth-totp, etc.). Final autonomous night run 2026-05-10 → 2026-05-11 produced **0 survivors / 4999 mutants / 99.75% official mutation score** — above the ≥95% target. 481 NoCoverage files remain as next-sprint backlog (mfa.route 62, audit-cron 39, redis-cache 38, langfuse 34, login-handler 33, totp-secret repo 22, etc.).

Banking-grade hot files config: `museum-backend/.stryker-hot-files.json` (chat schemas, auth, llm-judge guardrail, sanitizePromptInput). Mutation score per hot file enforced in CI nightly.

Commits: `daa3ef20` (final 0 survivors on shared/* + module-auth-totp), prior chunks `1604478c` (shared-db), `969a5ca5` (shared-http).

## Phase 13 — Chaos circuit breaker e2e (deferred to next sprint)

`tests/e2e/chaos-circuit-breaker.e2e.test.ts` skipped pending coordination with the LLMCircuitBreaker / opossum refactor. Activation tracked as a TECH_DEBT entry.
