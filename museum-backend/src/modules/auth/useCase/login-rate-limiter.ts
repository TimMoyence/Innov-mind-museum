/**
 * Distributed per-email login rate limiter (SEC-05).
 * Blocks brute-force password guessing by tracking failed attempts per email address.
 *
 * Uses a shared `RedisRateLimitStore` when configured (multi-instance safe);
 * falls back to an in-memory-only store when Redis is not initialized or every
 * Redis call fails (fail-open: security must not block the app when Redis is down).
 *
 * Synchronous contract, async distribution:
 * - The public API (`checkLoginRateLimit`, `recordFailedLogin`, `clearLoginAttempts`)
 *   is fully synchronous so consumers (authSession.service) do not change.
 * - `checkLoginRateLimit` reads the local snapshot (fast path).
 * - `recordFailedLogin` synchronously bumps the local snapshot AND fires a
 *   background Redis `INCR` that mirrors the distributed count back into the
 *   snapshot when it resolves. This means the second failed attempt across any
 *   pair of instances already sees the distributed count, bounding brute-force
 *   attempts at roughly `MAX_ATTEMPTS + O(latency)` total instead of
 *   `MAX_ATTEMPTS * numInstances`.
 * - `clearLoginAttempts` synchronously clears the snapshot AND fires a background
 *   Redis `DEL`.
 *
 * @module auth/useCase/login-rate-limiter
 */

import { tooManyRequests } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';
import { getRedisRateLimitStore } from '@src/helpers/middleware/rate-limit.middleware';

import type { RedisRateLimitStore } from '@src/helpers/middleware/redis-rate-limit-store';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const KEY_PREFIX = 'login-attempts:';

interface LoginAttempt {
  count: number;
  firstAttemptAt: number;
}

/**
 * Per-module local snapshot. Acts as the sole backing store when no Redis
 * store is registered (tests, single-instance dev) and as a live mirror of
 * the distributed counter when Redis is active (populated by background
 * Redis replies in `recordFailedLogin`).
 */
const localStore = new InMemoryBucketStore<LoginAttempt>({
  isExpired: (entry, now) => now - entry.firstAttemptAt > WINDOW_MS,
});

/**
 * Explicit Redis store override — only set via `setLoginRateLimitStore`.
 * When `undefined`, the limiter falls back to `getRedisRateLimitStore()` from
 * the shared rate-limit middleware singleton (populated in `src/index.ts`).
 * When `null`, Redis is explicitly disabled (used by tests).
 */
let overrideStore: RedisRateLimitStore | null | undefined;

/**
 * Register a Redis-backed rate-limit store for distributed login rate limiting.
 * Mainly useful for tests; in production the limiter auto-discovers the shared
 * store registered in `src/index.ts` via `getRedisRateLimitStore()`.
 * Pass `null` to force in-memory-only mode (used by tests).
 */
export const setLoginRateLimitStore = (store: RedisRateLimitStore | null): void => {
  overrideStore = store;
};

const resolveStore = (): RedisRateLimitStore | null => {
  if (overrideStore !== undefined) return overrideStore;
  return getRedisRateLimitStore();
};

const normalize = (email: string): string => email.toLowerCase().trim();

const redisKey = (email: string): string => `${KEY_PREFIX}${email}`;

/**
 * Mirror a distributed count into the local snapshot. Called from the background
 * Redis reply of `recordFailedLogin`. The snapshot's `firstAttemptAt` is derived
 * from the Redis-reported `resetAt` so the local expiry logic stays consistent.
 */
const mirrorRedisResult = (key: string, count: number, resetAt: number): void => {
  const firstAttemptAt = Math.max(0, resetAt - WINDOW_MS);
  localStore.set(key, { count, firstAttemptAt });
};

/**
 * Checks whether the given email has exceeded the maximum number of login attempts.
 *
 * @param email - The email address to check.
 * @throws {AppError} 429 if the rate limit has been exceeded.
 */
export const checkLoginRateLimit = (email: string): void => {
  const key = normalize(email);
  const entry = localStore.get(key);
  if (!entry) return;

  if (Date.now() - entry.firstAttemptAt > WINDOW_MS) {
    localStore.delete(key);
    return;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    throw tooManyRequests('Too many login attempts. Please try again later.');
  }
};

/**
 * Records a failed login attempt for the given email.
 * Synchronously updates the local snapshot and fires a background Redis `INCR`
 * whose reply mirrors the authoritative distributed count back into the snapshot.
 *
 * @param email - The email address that failed to authenticate.
 */
export const recordFailedLogin = (email: string): void => {
  const key = normalize(email);

  // 1. Sync local update (keeps single-instance semantics intact and gives the
  //    caller an immediately visible count for the next `checkLoginRateLimit`).
  const entry = localStore.get(key);
  if (!entry || Date.now() - entry.firstAttemptAt > WINDOW_MS) {
    localStore.set(key, { count: 1, firstAttemptAt: Date.now() });
  } else {
    entry.count += 1;
  }

  // 2. Background Redis INCR (multi-instance distribution). The reply
  //    overwrites the local snapshot with the authoritative count so that
  //    subsequent checks on this instance see failures from peer instances.
  const store = resolveStore();
  if (store) {
    void store
      .increment(redisKey(key), WINDOW_MS)
      .then(({ count, resetAt }) => {
        mirrorRedisResult(key, count, resetAt);
      })
      .catch((err: unknown) => {
        // Fail-open: log and keep the local snapshot as-is.
        logger.warn('login_rate_limit_record_fallback', {
          reason: err instanceof Error ? err.message : 'unknown',
        });
      });
  }
};

/**
 * Clears all recorded failed attempts for the given email (called on successful login).
 * Synchronously clears the local snapshot and fires a background Redis `DEL`.
 *
 * @param email - The email address to clear.
 */
export const clearLoginAttempts = (email: string): void => {
  const key = normalize(email);
  localStore.delete(key);

  const store = resolveStore();
  if (store) {
    void store.reset(redisKey(key)).catch((err: unknown) => {
      // Fail-open: local snapshot is already cleared.
      logger.warn('login_rate_limit_clear_fallback', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    });
  }
};

/** Exposed for testing only. */
export const _resetAllAttempts = (): void => {
  localStore.clear();
  overrideStore = null;
};
