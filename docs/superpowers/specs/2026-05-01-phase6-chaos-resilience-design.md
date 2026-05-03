# Phase 6 — Chaos Resilience (Design Spec)

- **Status**: Proposed (2026-05-01)
- **Owner**: QA/SDET
- **Scope**: museum-backend `tests/e2e/` + `tests/helpers/chaos/`
- **Pre-req for**: nothing (independent of Phases 7–8)
- **Estimated effort**: 1 working week
- **Spec lineage**: Phase 0 spec §chaos engineering minimal + existing `LLMCircuitBreaker` (3-state)

## 1. Problem Statement

Production has graceful-degradation paths but no e2e proof:

| Dependency | Failure mode | Production-coded fallback | E2E proof |
|---|---|---|---|
| **Redis** | unreachable / ECONNREFUSED | `RedisCacheService.get()` catches + returns null; module composition can fall back to `MemoryCacheService` or `NoopCacheService` | NONE |
| **LLM provider** | 500 / timeout / quota exceeded | `LLMCircuitBreaker` (CLOSED→OPEN→HALF_OPEN), `EMPTY_RESPONSE_FALLBACK`, `MISSING_LLM_KEY_FALLBACK` | NONE |
| **BullMQ knowledge-extraction worker** | offline | sync chat API doesn't depend on it | NONE — assumed but unverified |
| **PG read replica** | n/a (no replica today) | n/a | DEFER (Q4=α) |

Phase 6 wires e2e tests that inject failures via DI and assert the contracts hold.

## 2. Goals

1. **Chaos infra** — DI helpers under `tests/helpers/chaos/` that wrap real services with fault-injection wrappers.
2. **Redis-down e2e** — broken `RedisCacheService` wrapper throws on every op; chat endpoint returns 200 (degraded), no 5xx leak.
3. **LLM-provider e2e** — stub orchestrator throws `LLMProviderError` on next N calls; chat endpoint returns either circuit-breaker 503 (after threshold) or polite-refuse 200 w/ fallback string (under threshold).
4. **Circuit-breaker e2e** — exercise CLOSED → OPEN → HALF_OPEN transitions deterministically by injecting controlled failure timing + advancing a clock OR setting `openDurationMs` low.
5. **BullMQ worker chaos e2e** — knowledge-extraction worker not running; chat API responds 200 (sync path is independent).
6. **No production code changes.** Phase 6 only adds tests + chaos helpers.

## 3. Non-Goals

- PG read replica failover (no replica feature today).
- Multi-LLM-provider fallback (`OpenAI → Deepseek → Google` chain) — defer to a dedicated provider-fallback spec if/when the fallback is wired.
- Network partitioning / split-brain scenarios (out of banking-grade Phase-6 scope).
- Frontend / mobile chaos (out of scope).
- Web admin chaos (out of scope).

## 4. Architecture

### 4.1 Chaos helpers

```
museum-backend/tests/helpers/chaos/
├── broken-redis-cache.ts          (CacheService wrapper that throws)
├── stub-llm-orchestrator.ts       (LangChainChatOrchestratorDeps replacement that throws / returns fallback)
└── README.md                      (1-page guide)
```

#### `broken-redis-cache.ts`

```ts
import type { CacheService } from '@shared/cache/cache.port';

export interface BrokenRedisOptions {
  /** Mode: 'always-throw' (every op throws ECONNREFUSED) | 'flaky' (fails randomly N% of ops) */
  mode: 'always-throw' | 'flaky';
  /** Probability of failure for 'flaky' mode (0–1). */
  failureRate?: number;
  /** Custom error message — defaults to ECONNREFUSED-shaped message. */
  errorMessage?: string;
}

export class BrokenRedisCache implements CacheService {
  constructor(private readonly opts: BrokenRedisOptions) {}

  private fail(): never {
    throw Object.assign(new Error(this.opts.errorMessage ?? 'ECONNREFUSED 127.0.0.1:6379'), { code: 'ECONNREFUSED' });
  }

  private maybeFail(): void {
    if (this.opts.mode === 'always-throw') this.fail();
    if (Math.random() < (this.opts.failureRate ?? 0.5)) this.fail();
  }

  async get<T>(_key: string): Promise<T | null> { this.maybeFail(); return null; }
  async set(_k: string, _v: unknown, _ttl?: number): Promise<void> { this.maybeFail(); }
  async delete(_k: string): Promise<void> { this.maybeFail(); }
  async deleteByPrefix(_p: string): Promise<void> { this.maybeFail(); }
  async destroy(): Promise<void> { /* no-op for cleanup */ }
}
```

(The exact `CacheService` interface is read at plan time from `@shared/cache/cache.port`. Adjust signatures to match.)

#### `stub-llm-orchestrator.ts`

The harness already supports `chatService` injection. The chaos helper provides a `chatService` whose `langchain.orchestrator` stub throws on configured calls.

```ts
export interface StubLLMOrchestratorOptions {
  /** Number of consecutive calls that throw before returning fallback. */
  failuresBeforeFallback?: number;
  /** Throw type: 'llm-provider-error' | 'timeout' | 'quota-exceeded' */
  errorKind?: 'llm-provider-error' | 'timeout' | 'quota-exceeded';
  /** When set, every call returns this fallback text instead of attempting. */
  forceFallbackText?: string;
}

export class StubLLMOrchestrator {
  private callCount = 0;
  constructor(private readonly opts: StubLLMOrchestratorOptions) {}

  async invoke(_input: unknown): Promise<{ text: string; sections: Record<string, string> }> {
    this.callCount += 1;
    if (this.opts.forceFallbackText) {
      return { text: this.opts.forceFallbackText, sections: {} };
    }
    const limit = this.opts.failuresBeforeFallback ?? Number.MAX_SAFE_INTEGER;
    if (this.callCount <= limit) {
      throw this.makeError();
    }
    return { text: '...polite-refuse fallback...', sections: {} };
  }

  reset(): void { this.callCount = 0; }
  callsMade(): number { return this.callCount; }

  private makeError(): Error {
    if (this.opts.errorKind === 'timeout') {
      return Object.assign(new Error('LLM provider timeout'), { code: 'ETIMEDOUT' });
    }
    if (this.opts.errorKind === 'quota-exceeded') {
      return Object.assign(new Error('LLM provider quota exceeded'), { code: 'QUOTA_EXCEEDED', statusCode: 429 });
    }
    return Object.assign(new Error('LLM provider 500'), { statusCode: 500 });
  }
}
```

The actual orchestrator interface (`LangChainChatOrchestratorDeps`) is more complex; the plan reads it and wires the stub through whichever DI seams the production code exposes. If no seam exists, plan extends `chat-module.ts` to accept an orchestrator override (small additive change).

### 4.2 Harness extensions

`museum-backend/tests/helpers/e2e/e2e-app-harness.ts` already accepts `chatService` overrides. Extend it to also accept:
- `cacheService: CacheService | undefined` — replaces the production cache (used by all consumers via the composition root).
- `chatOrchestratorOverride: ChatOrchestrator | undefined` — replaces the LangChain orchestrator inside `buildChatService(...)`.

If the existing harness passes `chatService` already, the extension is just exposing an alternative `chatService` builder that wraps the orchestrator override.

### 4.3 Test file map

```
museum-backend/tests/e2e/
├── chaos-redis-down.e2e.test.ts            (Phase 6 Commit B)
├── chaos-llm-provider.e2e.test.ts          (Phase 6 Commit C)
├── chaos-circuit-breaker.e2e.test.ts       (Phase 6 Commit C)
└── chaos-bullmq-worker.e2e.test.ts         (Phase 6 Commit D)

museum-backend/tests/helpers/chaos/
├── broken-redis-cache.ts                    (Phase 6 Commit A)
├── stub-llm-orchestrator.ts                 (Phase 6 Commit A)
└── README.md                                (Phase 6 Commit A)
```

### 4.4 Acceptance contracts per file

#### `chaos-redis-down.e2e.test.ts`
1. Harness boots with `cacheService: new BrokenRedisCache({ mode: 'always-throw' })`.
2. POST `/api/chat/sessions` → 201 (session creation does not depend on cache).
3. POST `/api/chat/sessions/:id/messages` → 200 with assistant content (cache miss → recompute path; degraded latency acceptable).
4. The same query repeated → still 200 (cache write also fails silently; no compounding error).
5. `/api/health` → 200 (health check decoupled from Redis status).
6. Logs include exactly N `ECONNREFUSED` warnings (one per cache attempt) — assert via Sentry-mock or logger spy.
7. Response body does not leak `ECONNREFUSED` or stack traces.

#### `chaos-llm-provider.e2e.test.ts`
1. Stub orchestrator throws `LLMProviderError` (statusCode 500) on next 3 calls (below `failureThreshold=5`).
2. Each chat-message POST returns either:
   - 200 with a fallback assistant message (`EMPTY_RESPONSE_FALLBACK` or section fallback), OR
   - 503 with `LLM_PROVIDER_ERROR` code (depending on the actual production behavior — read the orchestrator at plan time).
3. After 3 failures, circuit breaker is still CLOSED (assert via internal state if exposed, OR via behavior — 6th call also fails normally not fast).
4. Stub configured to throw N≥5 → after 5 failures, breaker is OPEN. Next chat call returns 503 `CIRCUIT_BREAKER_OPEN` immediately (without invoking the stub — assert callsMade = 5 not 6+).
5. Body does not leak provider names ("OpenAI", "Deepseek") or API keys.

#### `chaos-circuit-breaker.e2e.test.ts`
1. Breaker config: `failureThreshold: 3`, `windowMs: 1000`, `openDurationMs: 500` (passed via override).
2. Stub orchestrator: 3 consecutive failures → breaker transitions to OPEN.
3. 4th call → 503 immediately.
4. Wait `openDurationMs + 50ms` → 5th call: breaker is HALF_OPEN, stub now succeeds, breaker → CLOSED.
5. 6th call → succeeds normally.
6. Re-failure: 3 more failures → OPEN again. Cooldown → recovery again.

This file directly proves the 3-state transition contract that Phase 4 mutation testing covers.

#### `chaos-bullmq-worker.e2e.test.ts`
1. Harness boots WITHOUT starting the knowledge-extraction worker (the harness has a flag or env-var to skip).
2. POST `/api/chat/sessions` + message → 200 (sync chat path does not depend on worker).
3. Trigger an artwork-enrichment job (e.g., uploading an image with EXIF) → 200 immediate response; the job lands in the queue but never processes.
4. `/api/health` → 200 (health does not block on queue depth in current design).
5. Queue length is non-zero (the job didn't fail; it's just unconsumed).
6. After test cleanup, queue is drained or the test container is destroyed.

If the harness currently always boots the worker, Phase 6 adds a `disableKnowledgeExtractionWorker: true` option.

### 4.5 Integration with Phase 4 mutation testing

The hot file `llm-circuit-breaker.ts` in `.stryker-hot-files.json` requires ≥80% kill ratio. Phase 6's `chaos-circuit-breaker.e2e.test.ts` adds high-quality test cases that directly exercise the CLOSED↔OPEN↔HALF_OPEN transitions — this should lift the kill ratio if it was below 80% in the Phase 4 baseline. **No threshold adjustment is needed**; the Phase 4 hot-files gate already enforces ≥80%, and Phase 6 helps satisfy it.

### 4.6 Test runtime + flakiness

Each chaos test uses small `windowMs` / `openDurationMs` values to keep wall-clock time low (~100ms-500ms per state transition). Total Phase 6 test runtime: ~30s on top of the existing e2e suite.

Flake risk: `Math.random()` in `BrokenRedisCache` flaky mode is the main source. Mitigation: tests default to `mode: 'always-throw'` (deterministic). Flaky mode is opt-in for specific tests that need it.

## 5. Risks & Mitigations

### Risk: chat-module.ts doesn't have a clean injection seam for the LangChain orchestrator

`buildChatService(dataSource, cache, museumRepository)` accepts cache + repo but not orchestrator.

**Mitigation:** the plan inspects `chat-module.ts` and either (a) finds an existing seam (e.g., env-var-driven or an overload), or (b) adds an optional `orchestratorOverride` parameter. Option (b) is a small additive change; production behavior unchanged when override absent.

### Risk: Sentry / logger noise pollutes the test output

Every chaos test deliberately triggers errors → logger fires → Sentry captures.

**Mitigation:** the harness already mocks Sentry in tests. Confirm `e2e-app-harness.ts` retains the mock; if not, add it.

### Risk: BullMQ worker chaos can't actually be tested if the test always starts the worker

If the harness's worker startup is hard-coded.

**Mitigation:** plan adds a harness option `startKnowledgeExtractionWorker: boolean` (default `true` for existing tests, `false` for the chaos test).

### Risk: Production code paths for LLM fallback differ from the spec assumption

The exact behavior on LLM failure (200 fallback vs 503) depends on the orchestrator implementation.

**Mitigation:** the plan reads `langchain.orchestrator.ts` + `assistant-response.ts` to extract the actual contract. Tests align to production reality, not assumed contracts.

### Risk: Circuit-breaker test races on time-based transitions

`Date.now()` in the breaker, `setTimeout`-driven recovery — hard to test deterministically.

**Mitigation:** override `openDurationMs` to a small value (500ms) + use `await new Promise(r => setTimeout(r, openDurationMs + 50))`. Banking-grade asserts the contract holds, not microsecond precision. If flake rate > 1%, switch to `jest.useFakeTimers()`.

### Risk: Parallel-session interference (still ongoing)

Same anti-leak protocol as Phases 0–5.

**Mitigation:** every commit goes through `git restore --staged .` + scoped `git add`.

## 6. Acceptance Criteria

Phase 6 is **done** when ALL hold:

- [ ] `museum-backend/tests/helpers/chaos/broken-redis-cache.ts` exists.
- [ ] `museum-backend/tests/helpers/chaos/stub-llm-orchestrator.ts` exists.
- [ ] `museum-backend/tests/helpers/chaos/README.md` exists.
- [ ] `museum-backend/tests/e2e/chaos-redis-down.e2e.test.ts` covers 7 cases per §4.4.
- [ ] `museum-backend/tests/e2e/chaos-llm-provider.e2e.test.ts` covers 5 cases per §4.4.
- [ ] `museum-backend/tests/e2e/chaos-circuit-breaker.e2e.test.ts` covers 6 cases per §4.4.
- [ ] `museum-backend/tests/e2e/chaos-bullmq-worker.e2e.test.ts` covers 6 cases per §4.4.
- [ ] All 4 e2e files pass when `RUN_E2E=true pnpm test:e2e` runs locally with Docker up.
- [ ] CLAUDE.md "Phase 6 — chaos resilience" subsection added.
- [ ] Phase 6 lands as 4 commits.

## 7. Phase 6 Commit Decomposition

1. **Commit A** — chaos helpers: `BrokenRedisCache`, `StubLLMOrchestrator`, README, harness extensions.
2. **Commit B** — `chaos-redis-down.e2e.test.ts` (7 cases).
3. **Commit C** — `chaos-llm-provider.e2e.test.ts` (5 cases) + `chaos-circuit-breaker.e2e.test.ts` (6 cases) — bundled because they share orchestrator override plumbing.
4. **Commit D** — `chaos-bullmq-worker.e2e.test.ts` (6 cases) + CLAUDE.md update.

## 8. Resolved decisions (2026-05-01)

- **Q1 = B** (split files per scenario).
- **Q2 = ii** (DI broken-Redis wrapper).
- **Q3 = x** (stub LangChain orchestrator).
- **Q4 = α** (skip PG read replica — feature does not exist).
- **Q5 = a** (cover BullMQ worker chaos).

No remaining open questions. Ready for plan generation.
