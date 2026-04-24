/**
 * Distributed per-email login rate limiter (SEC-05 + H6 hardening).
 *
 * Defends against brute-force password guessing with two independent mechanisms,
 * both multi-instance safe via Redis and both exposed through a synchronous
 * public API (consumers in `authSession.service` stay untouched):
 *
 * 1. **Sliding window counter** — `MAX_ATTEMPTS` failures allowed within
 *    `WINDOW_MS`. Identical to the original H6 behavior.
 *
 * 2. **Exponential lockout** — after `LOCKOUT_THRESHOLD` consecutive failures on
 *    the same email, subsequent attempts are blocked for
 *    `min(2^(failures - LOCKOUT_THRESHOLD) * BASE_LOCKOUT_MS, MAX_LOCKOUT_MS)`.
 *    The counter resets on `clearLoginAttempts` (called after a successful
 *    login). Stored under a SHA-1-hashed key so raw emails never appear in
 *    Redis logs. Blocked responses carry a `Retry-After` header via
 *    `AppError.headers` (applied by the global error middleware).
 *
 * Distributed correctness:
 * - Sliding window uses `RedisRateLimitStore.increment` (atomic Lua INCR+PEXPIRE).
 * - Lockout counter uses a dedicated Lua EVAL that atomically INCR + PEXPIRE
 *   the counter key and returns the authoritative value.
 * - The sync public API fires Redis ops in background; replies MIRROR the
 *   authoritative count back into a local snapshot so peer-instance failures
 *   become visible on subsequent `checkLoginRateLimit` calls on this instance.
 *
 * Fail-closed behavior (H6-specific):
 * - If a recent Redis op failed for this email (< DEGRADED_WINDOW_MS ago) AND
 *   the local snapshot has no trustworthy data, `checkLoginRateLimit` throws
 *   503 `AUTH_RATE_LIMIT_UNAVAILABLE` instead of silently allowing the attempt.
 *   This prevents a distributed botnet from bypassing the limiter by flooding
 *   an instance whose Redis connection just dropped — for login specifically
 *   we refuse rather than trust only-local state.
 *
 * @module auth/useCase/login-rate-limiter
 */

import { createHash } from 'node:crypto';

import { serviceUnavailable, tooManyRequests } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';
import { getRedisRateLimitStore } from '@src/helpers/middleware/rate-limit.middleware';

import type { RedisRateLimitStore } from '@src/helpers/middleware/redis-rate-limit-store';

// --- Sliding window ---------------------------------------------------------
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const KEY_PREFIX = 'login-attempts:';

// --- Exponential lockout ----------------------------------------------------
const LOCKOUT_THRESHOLD = 5;
const BASE_LOCKOUT_MS = 30 * 1000; // 30s
const MAX_LOCKOUT_MS = 15 * 60 * 1000; // 15 min
/** Failure counter TTL — long enough to track a brute-force burst, bounded. */
const LOCKOUT_COUNTER_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const LOCKOUT_KEY_PREFIX = 'auth:lockout:';

// --- Degraded-mode detection ------------------------------------------------
/** How long a Redis failure marks an email "unsafe to check from local only". */
const DEGRADED_WINDOW_MS = 30 * 1000;

/**
 * Atomic Lua script for the lockout counter: INCR + refresh TTL + return new
 * authoritative value. One round-trip prevents an instance crash between INCR
 * and PEXPIRE from leaking a TTL-less counter.
 *
 * KEYS[1] = counter key
 * ARGV[1] = counter TTL in ms
 *
 * Returns the counter value as integer.
 */
const LOCKOUT_INCR_LUA = `
local count = redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return count
`;

interface SlidingWindowEntry {
  count: number;
  firstAttemptAt: number;
}

interface LockoutEntry {
  failures: number;
  lastFailureAt: number;
}

const slidingStore = new InMemoryBucketStore<SlidingWindowEntry>({
  isExpired: (entry, now) => now - entry.firstAttemptAt > WINDOW_MS,
});

const lockoutStore = new InMemoryBucketStore<LockoutEntry>({
  isExpired: (entry, now) => now - entry.lastFailureAt > LOCKOUT_COUNTER_TTL_MS,
});

/**
 * Per-email timestamp until which Redis is considered degraded for this email.
 * Used to fail-closed with 503 when Redis is unreachable AND we have no local
 * snapshot to fall back on.
 */
const degradedUntil = new Map<string, number>();

let overrideStore: RedisRateLimitStore | null | undefined;

/**
 * Register a Redis-backed rate-limit store for distributed login rate limiting.
 * Mainly useful for tests; in production the limiter auto-discovers the shared
 * store registered in `src/index.ts` via `getRedisRateLimitStore()`.
 * Pass `null` to force in-memory-only mode (used by tests).
 *
 * @param store - The Redis-backed rate-limit store, or `null` to disable Redis.
 */
export const setLoginRateLimitStore = (store: RedisRateLimitStore | null): void => {
  overrideStore = store;
};

const resolveStore = (): RedisRateLimitStore | null => {
  if (overrideStore !== undefined) return overrideStore;
  return getRedisRateLimitStore();
};

const normalize = (email: string): string => email.toLowerCase().trim();

const slidingRedisKey = (email: string): string => `${KEY_PREFIX}${email}`;

/** Hash the email to avoid leaking raw identifiers into Redis or log dumps. */
const lockoutRedisKey = (email: string): string => {
  // eslint-disable-next-line sonarjs/hashing -- SHA-1 used only as a non-cryptographic key identifier, never for password storage or signing
  const hash = createHash('sha1').update(email).digest('hex');
  return `${LOCKOUT_KEY_PREFIX}${hash}`;
};

/**
 * Compute the lockout duration (ms) after `failures` consecutive failures.
 * Returns 0 if the threshold is not met yet.
 */
const computeLockoutMs = (failures: number): number => {
  if (failures < LOCKOUT_THRESHOLD) return 0;
  const overshoot = failures - LOCKOUT_THRESHOLD;
  const raw = Math.pow(2, overshoot) * BASE_LOCKOUT_MS;
  return Math.min(raw, MAX_LOCKOUT_MS);
};

const mirrorSlidingWindow = (key: string, count: number, resetAt: number): void => {
  const firstAttemptAt = Math.max(0, resetAt - WINDOW_MS);
  slidingStore.set(key, { count, firstAttemptAt });
};

/**
 * Mirror the authoritative lockout counter back into the local snapshot.
 * `lastFailureAt` is set to now so the local unlock clock starts when the
 * caller on THIS instance observed the failure — matching semantics of the
 * synchronous local-first update.
 */
const mirrorLockoutCounter = (key: string, failures: number): void => {
  lockoutStore.set(key, { failures, lastFailureAt: Date.now() });
};

const markRedisDegraded = (key: string): void => {
  degradedUntil.set(key, Date.now() + DEGRADED_WINDOW_MS);
};

const clearRedisDegraded = (key: string): void => {
  degradedUntil.delete(key);
};

const isRedisDegraded = (key: string): boolean => {
  const until = degradedUntil.get(key);
  if (until === undefined) return false;
  if (Date.now() > until) {
    degradedUntil.delete(key);
    return false;
  }
  return true;
};

/**
 * Checks whether the given email has exceeded the maximum login attempts or is
 * currently locked out from exponential backoff.
 *
 * @param email - The email address to check.
 * @throws {AppError} 429 if rate-limited / locked out. 503 if Redis is degraded
 *   AND no local snapshot is available (fail-closed for login).
 */
export const checkLoginRateLimit = (email: string): void => {
  const key = normalize(email);
  const now = Date.now();

  // 1. Lockout takes precedence — it represents an adversarial pattern.
  const lockEntry = lockoutStore.get(key);
  if (lockEntry && lockEntry.failures >= LOCKOUT_THRESHOLD) {
    const lockoutMs = computeLockoutMs(lockEntry.failures);
    const unlockAt = lockEntry.lastFailureAt + lockoutMs;
    if (now < unlockAt) {
      const retryAfterSec = Math.max(1, Math.ceil((unlockAt - now) / 1000));
      throw tooManyRequests(
        'Account temporarily locked due to repeated failed attempts. Try again later.',
        {
          retryAfterSec,
          code: 'AUTH_LOCKED_OUT',
          details: { retryAfterSec, failures: lockEntry.failures },
        },
      );
    }
    // Lockout window expired — fall through to sliding-window. The counter
    // stays in place and only clears on a successful login or TTL expiry.
  }

  // 2. Sliding window (original H6 behavior).
  const entry = slidingStore.get(key);
  if (entry) {
    if (now - entry.firstAttemptAt > WINDOW_MS) {
      slidingStore.delete(key);
    } else if (entry.count >= MAX_ATTEMPTS) {
      const resetAt = entry.firstAttemptAt + WINDOW_MS;
      const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
      throw tooManyRequests('Too many login attempts. Please try again later.', {
        retryAfterSec,
        details: { retryAfterSec },
      });
    }
  }

  // 3. Fail-closed if Redis is configured but degraded AND we have no local
  //    snapshot. Blocks a botnet from piling attempts on an instance whose
  //    Redis link just dropped — for login we refuse rather than guess.
  if (resolveStore() && isRedisDegraded(key) && !entry && !lockEntry) {
    throw serviceUnavailable('Authentication temporarily unavailable. Please retry shortly.', {
      retryAfterSec: 5,
      code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
    });
  }
};

/**
 * Records a failed login attempt for the given email.
 * Synchronously bumps both local snapshots (sliding window + lockout counter)
 * and fires background Redis ops that mirror the authoritative counts back
 * so peer-instance failures become visible on subsequent checks here.
 *
 * @param email - The email address that failed to authenticate.
 */
export const recordFailedLogin = (email: string): void => {
  const key = normalize(email);
  const now = Date.now();

  // 1. Sync sliding-window update (unchanged semantics).
  const entry = slidingStore.get(key);
  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    slidingStore.set(key, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }

  // 2. Sync lockout counter update — next `checkLoginRateLimit` sees it.
  const lockEntry = lockoutStore.get(key);
  if (!lockEntry) {
    lockoutStore.set(key, { failures: 1, lastFailureAt: now });
  } else {
    lockEntry.failures += 1;
    lockEntry.lastFailureAt = now;
  }

  const store = resolveStore();
  if (!store) return;

  // 3. Background Redis sliding window (atomic Lua INCR+PEXPIRE in store).
  void store
    .increment(slidingRedisKey(key), WINDOW_MS)
    .then(({ count, resetAt }) => {
      clearRedisDegraded(key);
      mirrorSlidingWindow(key, count, resetAt);
    })
    .catch((err: unknown) => {
      markRedisDegraded(key);
      logger.warn('login_rate_limit_record_fallback', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    });

  // 4. Background atomic lockout counter (dedicated Lua EVAL).
  void incrementLockoutCounter(store, lockoutRedisKey(key))
    .then((failures) => {
      if (failures === null) {
        markRedisDegraded(key);
        return;
      }
      clearRedisDegraded(key);
      mirrorLockoutCounter(key, failures);
    })
    .catch((err: unknown) => {
      markRedisDegraded(key);
      logger.warn('login_rate_limit_lockout_fallback', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    });
};

/**
 * Atomically increments the per-email lockout counter in Redis using a Lua
 * EVAL so INCR + PEXPIRE cannot be split across instances (the classic race
 * that would leak a counter without TTL and pin memory indefinitely).
 *
 * @param store - The Redis-backed rate-limit store.
 * @param key - Fully-prefixed lockout counter key.
 * @returns The new counter value, or `null` if Redis EVAL fails.
 */
const incrementLockoutCounter = async (
  store: RedisRateLimitStore,
  key: string,
): Promise<number | null> => {
  try {
    const client = store.getRedisClient();
    const result = (await client.eval(
      LOCKOUT_INCR_LUA,
      1,
      key,
      String(LOCKOUT_COUNTER_TTL_MS),
    )) as number;
    return typeof result === 'number' ? result : null;
  } catch {
    return null;
  }
};

/**
 * Clears all recorded failed attempts for the given email (called on successful
 * login). Synchronously clears both local snapshots and fires background
 * Redis `DEL`s for the sliding-window and lockout counter keys.
 *
 * @param email - The email address to clear.
 */
export const clearLoginAttempts = (email: string): void => {
  const key = normalize(email);
  slidingStore.delete(key);
  lockoutStore.delete(key);
  clearRedisDegraded(key);

  const store = resolveStore();
  if (!store) return;

  // Sliding window
  void store.reset(slidingRedisKey(key)).catch((err: unknown) => {
    logger.warn('login_rate_limit_clear_fallback', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
  });

  // Lockout counter — use the raw Redis client since the store prefixes keys.
  void clearLockoutCounter(store, lockoutRedisKey(key)).catch((err: unknown) => {
    logger.warn('login_rate_limit_lockout_clear_fallback', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
  });
};

const clearLockoutCounter = async (store: RedisRateLimitStore, key: string): Promise<void> => {
  try {
    await store.getRedisClient().del(key);
  } catch {
    // Best-effort
  }
};

/** Exposed for testing only. */
export const _resetAllAttempts = (): void => {
  slidingStore.clear();
  lockoutStore.clear();
  degradedUntil.clear();
  overrideStore = null;
};

/**
 * Exposed for testing only: clears the local sliding-window + lockout snapshots
 * for a specific email WITHOUT clearing the degraded marker. Used to simulate a
 * "cold instance" scenario (snapshot cleared or never populated) while Redis is
 * still degraded for this email — which must trigger the fail-closed 503 path.
 *
 * @param email - The email whose local snapshot should be cleared.
 */
export const _clearLocalOnlyForTest = (email: string): void => {
  const key = normalize(email);
  slidingStore.delete(key);
  lockoutStore.delete(key);
};
