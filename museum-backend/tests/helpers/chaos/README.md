# Chaos Test Helpers (Phase 6)

Fault-injection wrappers for e2e chaos tests. Use to assert graceful-degradation contracts.

## `BrokenRedisCache`

Implements the full `CacheService` port. Modes:
- `'always-throw'` — every op throws ECONNREFUSED (deterministic; default for tests).
- `'flaky'` — fails randomly per `failureRate` (0–1).

```ts
import { BrokenRedisCache } from 'tests/helpers/chaos/broken-redis-cache';

const cache = new BrokenRedisCache({ mode: 'always-throw' });
const harness = await createE2EHarness({ cacheService: cache });
// chat endpoints work; cache.callsMade() reveals attempts.
```

## `StubLLMOrchestrator`

Replaces the LangChain orchestrator with a configurable failure injector. Matches the existing harness inline orchestrator shape (`generate()` + `generateStream()`).

```ts
import { StubLLMOrchestrator } from 'tests/helpers/chaos/stub-llm-orchestrator';

const stub = new StubLLMOrchestrator({ failuresBeforeFallback: 3, errorKind: 'llm-provider-error' });
const harness = await createE2EHarness({ chatOrchestratorOverride: stub });
// First 3 calls throw; subsequent calls return fallback text.
```

## When NOT to use these

- Pure-function logic — use `tests/unit/`.
- Real-DB integration without chaos — use `createIntegrationHarness()` from Phase 1.
- Verifying happy-path orchestrator — use the existing harness's synthetic orchestrator.
