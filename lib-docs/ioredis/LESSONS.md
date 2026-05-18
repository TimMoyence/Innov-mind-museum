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
