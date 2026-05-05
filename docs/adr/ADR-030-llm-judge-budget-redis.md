# ADR-030 — LLM-judge daily budget store: Redis SET+TTL

- **Status** : Accepted (2026-05-05)
- **Ticket** : Sprint 2026-05-05 backend-hardening, Step D
- **Supersedes** : N/A
- **Amends** : ADR-015 (LLM judge guardrail v2) Phase 2 plan

## Context

ADR-015 introduced an LLM-as-judge layer for the chat guardrail and gated it on a daily cost cap (`LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY`, default 500¢ = €5/day). The v1 implementation tracked cumulative spend in a per-process module-level variable. ADR-015 documented this as a deliberate trade-off:

> "MULTI-INSTANCE NOTE: this counter is per-process. In a horizontally scaled deployment with N replicas, cumulative spend across the fleet can be up to N× the configured cap. Acceptable v1 trade-off — Phase 2 plan: move counter to Redis (SET with ~25h TTL)."

Phase 2 is now due. Production runs ≥2 backend replicas behind nginx, so the v1 counter overshoots the cap by 2×. With future autoscaling the overshoot is unbounded — an ops mishap (forgotten replica) silently doubles the LLM-spend without crossing any alerting threshold.

## Decision

Migrate the cumulative cost counter to a Redis-backed atomic counter, configurable via `GUARDRAIL_BUDGET_BACKEND=memory|redis`. Default `redis` in production (multi-instance) and `memory` in test/dev (no Redis dependency for unit/e2e suites).

### Implementation

- New port `IGuardrailBudgetStore` (in `useCase/guardrail/guardrail-budget.ts`):
  - `recordCost(cents): Promise<void>` — adds to today's running total.
  - `cumulativeCents(): Promise<number>` — reads today's total.
  - `reset(): Promise<void>` — force-clears the counter.
- Two adapters in the same file:
  - `InProcessGuardrailBudgetStore` — preserves the F4 behaviour (per-process counter, lazy UTC-midnight reset).
  - `RedisGuardrailBudgetStore` — talks to a `CacheService`, key `guardrail:judge:budget:<YYYY-MM-DD>`, TTL = seconds until UTC midnight + 60s buffer.
- `CacheService` port gains an atomic `incrBy(key, amount, ttlSeconds): Promise<number | null>` method. Redis impl uses an `EVAL` Lua script to commit `INCRBY` + `EXPIRE` atomically; pipelines were rejected because a failure between the two commands could leave the key without a TTL (memory leak).
- Backend selection happens at module boot via `configureGuardrailBudget({ cache })`, called from `chat-module.ts` `build()`. If `budgetBackend === 'redis'` but no `CacheService` is supplied (e.g. `CACHE_ENABLED=false` in dev), the factory falls back to in-process and emits a `guardrail_judge_budget_redis_unavailable` warning rather than deadlocking the judge.

### Fail-CLOSED on Redis outage

When Redis is unreachable (`CacheService` returns `null` from `incrBy` / `get`), the Redis adapter treats malformed counters as **infinite** spend. `getBudgetExhausted()` returns `true`, the LLM judge bails, and the keyword-only fallback handles the request. This protects against a Redis-DDoS used to bypass the cumulative cap.

A misbehaving Redis that returns negative values is also treated as fail-CLOSED (logged via `guardrail_judge_budget_counter_invalid`).

### TTL semantics

The counter expires `secondsUntilUtcMidnight() + 60` seconds after each increment. The 60-second buffer absorbs clock skew between the app and Redis: a key that the app still considers "today" cannot be expired by Redis a few milliseconds early.

### Test seam

`__setStoreForTest(store | null)` lets unit tests inject a stub directly without touching the env flag. Combined with the existing `__setNowForTest(date)` clock seam, both daily-reset and Redis-failure paths are covered without spinning up a Redis container in unit tests. An integration test against a real Redis testcontainer is **deferred** to a follow-up commit (the unit suite already exercises `CacheService.incrBy` semantics through `InMemoryCacheService`, which mirrors the Redis adapter's contract).

## Consequences

**Positive:**
- Multi-instance deployments respect the configured budget cap to within 1 increment (the atomic `INCRBY` is the bottleneck).
- The fail-CLOSED behaviour is now load-bearing: a broken Redis stops LLM-judge spend rather than silently disabling the cap.
- Same key naming + TTL pattern can be reused for future per-replica counters (rate limits, metering).

**Neutral:**
- Public API `recordJudgeCost` / `getBudgetExhausted` / `resetBudget` becomes async. The single in-tree caller (`llm-judge-guardrail.ts:judgeWithLlm`) was already async. No external change.

**Negative:**
- Redis is now on the critical path for the LLM-judge guard. A Redis outage degrades the judge to keyword-only — same as v1 budget-exhausted behaviour, but more frequent (any Redis blip flips the judge off for the duration). Acceptable: keyword-only is the documented fallback and the chat pipeline keeps working.
- Adds one dependency hop per judged message (1 Redis round-trip for `incrBy`). p99 ≤ 1ms in the same-VPC topology — negligible vs the LLM-judge call itself (p99 ≤ 500ms).

## Rollback

Set `GUARDRAIL_BUDGET_BACKEND=memory` and restart the backend. The factory will pick the in-process adapter at next boot — no schema changes, no data migration, no client-side ripple.
