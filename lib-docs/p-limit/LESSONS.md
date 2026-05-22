# Lessons — p-limit (v3.1.0)

First curation 2026-05-20.

## Why we're on v3 and not v7

`museum-backend` is CommonJS (no `"type": "module"` in `package.json`, tsconfig `"module": "commonjs"`). `p-limit@4+` is **pure ESM** → `require('p-limit')` throws `ERR_REQUIRE_ESM`. Upgrading requires a backend-wide ESM migration. Out of scope for V1 launch (2026-06-01). Locked to `^3` → resolves v3.1.0 (2020).

## ✅ Positives (current state)

- **Wrapped in `Semaphore`** : `src/modules/chat/useCase/llm/semaphore.ts` is the canonical primitive. Adds bounded queue (`maxQueueSize: 200`), acquire timeout (`acquireTimeoutMs: 30_000`), and synchronous shadow counters for deterministic test observability.
- **Concurrency tuned to upstream quota** : `wikidata-enricher.ts:28` uses `DEFAULT_CONCURRENCY = 5` matching Wikidata SPARQL's documented politeness window.
- **Single direct import** : grep of `museum-backend/src/` confirms `pLimit` is imported in exactly ONE place (`semaphore.ts:1`). The wrapper discipline is intact.

## ⚠️ F1 LOW — `wikidata-enricher.ts` ships its own `runWithLimit` instead of using `Semaphore`

`src/modules/chat/useCase/visual-similarity/wikidata-enricher.ts:66-93` implements a 27-LOC worker pool with the comment *"in lieu of pulling in p-limit"*. The comment is stale — `p-limit` IS in the dependency graph, and `Semaphore` already wraps it. This duplicate primitive lacks:
- bounded queue size (unbounded grows)
- acquire timeout (a stuck task starves the queue)
- queue-depth observability

**Recommendation** : consolidate to `Semaphore` post-V1. Low priority — concurrency cap (5) already bounds the in-flight set so the unbounded queue is largely theoretical at current scale.

## ⚠️ F2 INFO — No AbortSignal propagation through `Semaphore.use()`

`Semaphore.use(task)` cannot abort a queued task on caller cancellation. v3 has no native abort support, but the wrapper could accept a `signal` and (a) reject queued waiters on `signal.aborted` (b) propagate the signal into the task body. Not currently needed (LLM calls already have provider-level timeouts) ; flag for the eventual ESM migration when bumping to p-limit v7+.

## ⚠️ F3 INFO — v3 is 5 years old (released 2020)

Sindre's libraries are stable, but pure-v3 transitive security fixes will eventually stop. No CVEs as of May 2026, but plan migration before V2 (August 2026) walking-guide launch.

## Cross-references

- `PATTERNS.md` §2 — upgrade decision matrix (ESM strategy).
- `PATTERNS.md` §7 — testing patterns (shadow counters, saturation, timeout).
- `lib-docs/opossum/PATTERNS.md` §4 — sibling "one breaker per upstream" doctrine mirrors "one Semaphore per logical upstream".

## Stats (2026-05-20)

- 1 direct `pLimit()` call site (`semaphore.ts:38`)
- 1 stale custom worker pool (`wikidata-enricher.ts:66-93`)
- 0 CVEs
- 0 ESM-only divergences (CJS-compat pin)
