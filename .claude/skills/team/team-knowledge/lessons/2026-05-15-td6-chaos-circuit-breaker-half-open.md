---
runId: 2026-05-15-td6-chaos-circuit-breaker-half-open
mode: refactor
pipeline: enterprise
completedAt: 2026-05-15T10:30:00Z
durationMs: 5400000
correctiveLoops: 0
costUSD: 4.5
tags:
  - refactor
  - enterprise
  - tech
  - debt
  - td-6
---

# Lesson — 2026-05-15-td6-chaos-circuit-breaker-half-open

## Trigger

- input: TECH_DEBT.md TD-6, chaos-circuit-breaker.e2e.test.ts:105 (it.todo), LangChainChatOrchestrator + LLMCircuitBreaker code.
- output: spec.md (R1..R7 EARS), design.md (D1..D6).
- decisions: option (b) — test-only swap-proxy in `tests/helpers/e2e/e2e-app-harness.ts`, NOT a `setModel()` on the orchestrator. `LangChainChatOrchestrator` keeps `model`/`circuitBreaker` as `private readonly` (verified at langchain.orchestrator.ts:79-88). Critical invariant: post-swap success orchestrator must SHARE the same `LLMCircuitBreaker` instance with the failing one (otherwise post-swap starts CLOSED and the test is meaningless) — handled by refactoring `buildFailingOrchestrator` to return `{ orchestrator, breaker }`.
- finding: stale comment at chaos-circuit-breaker.e2e.test.ts:101 says "TD-5" but TECH_DEBT.md tracks this as TD-6 — deleted in same edit per memory `feedback_bury_dead_code`.
- open questions handed to user: none — Q1 (HALF_OPEN→OPEN coverage) already handled by existing test at line 107.

## What worked

- gates run: lint, tsc, tests, gitnexus_detect_changes
- verdict: PASS / WARN / FAIL
- failures: ...
- corrective loops used: 0 / 1 / 2 (cap)

## What failed

- spec ↔ implementation alignment: ...
- KISS / DRY / hexagonal compliance: ...
- verdict: PASS / WARN / FAIL
- comments: ...

## Surprises

- input: tasks.md (T1.1…T3.2)
- changed files: ...
- gates that passed inline (post-edit hooks): lint ✅, tsc ✅
- gates deferred to verifier: tests, mutation
- notes: ...

## Action items

- commit: ...
- KB updates: velocity-metrics, agent-roi, error-patterns
- telemetry summary (Langfuse): tokens=... cost=$... elapsed=...
