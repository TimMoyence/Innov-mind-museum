# Lessons — ioredis (v5.10.1)

Project-specific gotchas. Audit enterprise-grade 2026-05-18.

## 2026-05-18 — MEDIUM : `retryStrategy` non configuré (4 client sites)
- **Symptôme** : default retryStrategy reconnects forever (50ms*attempt cap 2s). `enableOfflineQueue:false` sur BullMQ client → queue commands fail fast pendant reconnect window (intentional mais non documenté).
- **Fix** : voir TD-IO-01. Add per-client explicit `retryStrategy: (n) => Math.min(n*50, 2000)` ou non-number pour stop après N attempts.

## 2026-05-18 — MEDIUM : `reconnectOnError` non configuré (ElastiCache failover risk)
- **Symptôme** : si prod migre vers ElastiCache avec replica failover, `READONLY` errors on writes ne triggerent PAS reconnect → commands fail jusqu'à manual restart.
- **Status** : latent (single-instance Redis prod actuellement).
- **Fix** : voir TD-IO-02. Add `reconnectOnError: (err) => err.message.includes('READONLY') ? 2 : false` au shared opts factory.

## 2026-05-18 — LOW : `enableReadyCheck: false` missing sur BullMQ conn factory
- **Cause** : `createRedisConnectionOptions` (index.ts:65-72) set `maxRetriesPerRequest:null` ✓ mais omits `enableReadyCheck:false` que PATTERNS.md L223 liste comme 'commonly required by BullMQ'.
- **Impact actuel** : nul (CI = unrestricted redis:7-alpine). Surface sur Redis Enterprise / ACL hardening.
- **Fix** : voir TD-IO-03. Add `enableReadyCheck: false` au return.

## 🚨 2026-05-18 — INFO : `createSocialOtcStore` factory défini MAIS jamais wiré (DEAD CODE candidate)
- **Symptôme** : `social-otc-store.ts:149` define factory ; grep src/ shows ZERO callers (only `setSocialNonceStore` wiré index.ts:114).
- **Status** : soit intentional (mobile-only path wiré ailleurs ?), soit dead-code UFR-016 candidate à enterrer.
- **Fix** : voir TD-IO-04. Vérifier wire-site auth composition root OR enterrer per UFR-016.

## 2026-05-18 — Atomic patterns project-specific
- **`SET ... EX ... NX`** : nonce-store.ts:108, social-otc-store.ts:117 (PATTERNS.md §3 DO #6)
- **`GETDEL`** : nonce-store.ts:121, social-otc-store.ts:128 (Redis ≥6.2 single-use consume)
- **Lua eval `INCR+EXPIRE`** : redis-rate-limit-store.ts:16-28, redis-llm-cost-counter.ts:26-33

## 2026-05-18 — Validations positives
- ✅ Single shared connection (index.ts:90 reused by RateLimit + LlmCostCounter + NonceStore)
- ✅ Default v5 import `import Redis from 'ioredis'`
- ✅ `enableReadyCheck:false` sur rate-limit/cache clients (avoid INFO/ACL friction)
- ✅ Graceful disconnect `redis.quit()` (NOT `.disconnect()`)
- ✅ Variadic `del(...keys)` single round-trip
- ✅ Upper-case command tokens (`'EX'`, `'NX'`)
- ✅ Fail-soft cache on get/set/del errors (redis-cache.service.ts:52,62,71,91)

## 2026-05-20 — Refresh wave (UFR-022)

**Pin status** : `^5.10.1` still latest. 0 GHSA. No breaking changes since 2026-05-18. KEEP pin.

### Closures (verified by re-scan)

- **TD-IO-01 — `retryStrategy` configured everywhere** : ✅ CLOSED. Found at `src/index.ts:73, 101` (BullMQ factory + rate-limit client) and `src/shared/cache/redis-cache.service.ts:22` (cache). All four ioredis instantiation sites carry `(times) => Math.min(times * 50, 2000)`.
- **TD-IO-02 — `reconnectOnError` configured everywhere** : ✅ CLOSED. Same three sites carry `(err) => err.message.includes('READONLY') ? 2 : false` (return-2 = reconnect + resend). ElastiCache failover defense in place.

### Still open

- **TD-IO-03 — `enableReadyCheck:false` missing on BullMQ factory** : `createRedisConnectionOptions()` (`src/index.ts:65-77`) sets `maxRetriesPerRequest:null` + `enableOfflineQueue:false` but NOT `enableReadyCheck:false`. Cache + rate-limit clients HAVE it. Impact = nil today (CI Redis = unrestricted `redis:7-alpine`), surfaces under Redis Enterprise / ACL hardening (locked-down `INFO` would hang BullMQ ready handshake). LOW.
- **TD-IO-04 — `createSocialOtcStore` factory defined but never wired** : grep confirms still no callers (only `setSocialNonceStore` wired `index.ts:122`). Either intentional (mobile-only future-wire) or dead-code UFR-016 candidate. INFO.

### New findings (2026-05-20)

- **F-IO-05 (INFO)** : `redisClient` (rate-limit / counters / nonce) is **shared by 3 use cases** (RedisRateLimitStore, RedisLlmCostCounter, RedisNonceStore). Currently fine — all three are non-blocking and non-subscribe — but if pub/sub or BullMQ ever lands on this client by accident, the single-mode-per-connection invariant breaks. Recommendation: add a `// SHARED BY: rate-limit / llm-cost-counter / nonce-store — never put pub/sub or BullMQ on this client` comment at the `new Redis(env.cache.url, {...})` site to make the contract explicit.
- **F-IO-06 (INFO)** : `RedisCacheService.delByPrefix` (`redis-cache.service.ts:78-96`) uses `SCAN`+`DEL` paginated loop. SAFE in single-instance mode. In **Cluster mode** (`createRedisClusterClient`), `SCAN` runs per-node and `DEL(...keys)` requires same-slot keys — current `LlmCacheServiceImpl.invalidateMuseum` uses prefixes like `llm:v2:museum-mode:42:` which scatters across slots → would throw `CROSSSLOT` in cluster. Project does not run Cluster in V1, but flag here so the next refactor toward cluster picks up either hash-tags or a per-slot scan. LOW (latent).
- **F-IO-07 (INFO)** : Cluster client factory (`src/shared/cache/redis-client.ts:22-34`) returns a `Cluster` instance but doesn't pass `retryStrategy` / `reconnectOnError` / `enableReadyCheck` — these flow via `redisOptions` to the per-node clients. Today only `password` is set. If the Cluster path is exercised in V1.1+, mirror the standalone tunings:
  ```ts
  new Cluster(nodes, {
    redisOptions: {
      password,
      retryStrategy: (n) => Math.min(n * 50, 2000),
      reconnectOnError: (err) => err.message.includes('READONLY') ? 2 : false,
      enableReadyCheck: false,
    },
    slotsRefreshInterval: 5000, // explicit — v5 default disabled
  });
  ```
  LOW (latent; ADR-023 hot-cache path not wired V1).
- **F-IO-08 (INFO)** : `redisClient.on('error', …)` attached at `src/index.ts:105-110`. Cache client (`redis-cache.service.ts`) does NOT attach an `error` listener — `try/catch` around each operation absorbs the per-call error but a reconnect-storm emits standalone `'error'` events the `EventEmitter` could surface as unhandled. Add a defensive `this.redis.on('error', () => { /* logged via per-call catch */ })` in the constructor.

### Doc structure changes since 2026-05-18

| URL | 2026-05-18 status | 2026-05-20 status |
|---|---|---|
| `https://github.com/redis/ioredis` (README) | 200 | 200 (no change) |
| `https://github.com/redis/ioredis/wiki/Upgrading-from-v4-to-v5` | 200 | 200 (no change) |
| `https://github.com/redis/ioredis/releases` | 200 | 200, head still v5.10.1 |
| `https://github.com/redis/ioredis/security/advisories` | 200 | 200 — still 0 advisories |
| `https://github.com/advisories?query=ioredis` | not attempted | 200 — 0 results |
| `https://github.com/redis/ioredis/blob/main/examples/cluster.js` | 404 | 404 (still) |
| `https://redis.github.io/ioredis/interfaces/RedisOptions.html` | 404 | 404 (still) |
| `https://raw.githubusercontent.com/redis/ioredis/main/examples/sentinel.ts` | 404 | 404 (still) |
| `https://raw.githubusercontent.com/redis/ioredis/main/examples/pubsub.ts` | 404 | 404 (still) |

### Action items (non-blocking, next /team cycle if opportunity)

1. Close **TD-IO-03** : add `enableReadyCheck: false` to `createRedisConnectionOptions()` in `src/index.ts`.
2. Decide **TD-IO-04** : wire `createSocialOtcStore` at the auth composition root OR enterrer per UFR-016.
3. **F-IO-05** : add explicit "shared by" comment at the rate-limit/counter/nonce client construction site.
4. **F-IO-08** : add no-op `.on('error', …)` to `RedisCacheService` constructor for symmetry with rate-limit client.
5. (V1.1+) When Cluster path is exercised, mirror tunings into `createRedisClusterClient` (F-IO-07) AND rework `delByPrefix` to be slot-safe (F-IO-06).

