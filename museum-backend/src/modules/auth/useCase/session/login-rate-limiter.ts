/**
 * Distributed per-email login rate limiter (SEC-05 + H6).
 *
 * Two independent mechanisms, multi-instance safe via Redis, synchronous public API:
 *
 * 1. **Sliding window** — `MAX_ATTEMPTS` within `WINDOW_MS` (original H6).
 * 2. **Exponential lockout** — after `LOCKOUT_THRESHOLD` consecutive failures,
 *    block for `min(2^(failures - LOCKOUT_THRESHOLD) * BASE_LOCKOUT_MS, MAX_LOCKOUT_MS)`.
 *    Counter resets on `clearLoginAttempts` (after successful login). SHA-1-hashed
 *    key so raw emails never appear in Redis logs. Blocked responses carry
 *    `Retry-After` via `AppError.headers`.
 *
 * Distributed correctness:
 * - Sliding window: `RedisRateLimitStore.increment` (atomic Lua INCR+PEXPIRE).
 * - Lockout counter: dedicated Lua EVAL atomically INCR + PEXPIRE.
 * - Sync API fires Redis ops in background; replies MIRROR the authoritative
 *   count back to a local snapshot so peer-instance failures become visible
 *   on subsequent `checkLoginRateLimit` here.
 *
 * Fail-closed (H6): if recent Redis op failed (<DEGRADED_WINDOW_MS) AND local
 * snapshot is empty, `checkLoginRateLimit` throws 503 `AUTH_RATE_LIMIT_UNAVAILABLE`
 * instead of allowing — prevents a botnet from bypassing the limiter by flooding
 * an instance whose Redis link just dropped.
 */

import { createHash } from 'node:crypto';

import { serviceUnavailable, tooManyRequests } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { getRedisRateLimitStore } from '@shared/middleware/rate-limit.middleware';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

import type { RedisRateLimitStore } from '@shared/middleware/redis-rate-limit-store';

// Sliding window
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const KEY_PREFIX = 'login-attempts:';

// Exponential lockout
const LOCKOUT_THRESHOLD = 5;
const BASE_LOCKOUT_MS = 30 * 1000;
const MAX_LOCKOUT_MS = 15 * 60 * 1000;
const LOCKOUT_COUNTER_TTL_MS = 24 * 60 * 60 * 1000;
const LOCKOUT_KEY_PREFIX = 'auth:lockout:';

/** How long a Redis failure marks an email "unsafe from local only". */
const DEGRADED_WINDOW_MS = 30 * 1000;

/**
 * Atomic INCR + PEXPIRE — one round-trip prevents an instance crash between
 * INCR and PEXPIRE from leaking a TTL-less counter.
 * KEYS[1]=counter key, ARGV[1]=TTL ms. Returns counter int.
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

/** Per-email timestamp until Redis is degraded — fail-closed 503 when no local snapshot. */
const degradedUntil = new Map<string, number>();

let overrideStore: RedisRateLimitStore | null | undefined;

/** Pass `null` to force in-memory-only mode (tests). Prod auto-discovers via `getRedisRateLimitStore()`. */
export const setLoginRateLimitStore = (store: RedisRateLimitStore | null): void => {
  overrideStore = store;
};

const resolveStore = (): RedisRateLimitStore | null => {
  if (overrideStore !== undefined) return overrideStore;
  return getRedisRateLimitStore();
};

const normalize = (email: string): string => email.toLowerCase().trim();

const slidingRedisKey = (email: string): string => `${KEY_PREFIX}${email}`;

/** Hash to avoid leaking raw identifiers into Redis/log dumps. */
const lockoutRedisKey = (email: string): string => {
  // eslint-disable-next-line sonarjs/hashing -- SHA-1 used only as a non-cryptographic key identifier, never for password storage or signing
  const hash = createHash('sha1').update(email).digest('hex');
  return `${LOCKOUT_KEY_PREFIX}${hash}`;
};

/** Returns 0 if threshold not met yet. */
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
 * `lastFailureAt=now` so local unlock clock starts when THIS instance observed
 * the failure (matches sync local-first update semantics).
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
 * @throws {AppError} 429 if rate-limited / locked out. 503 if Redis degraded
 *   AND no local snapshot (fail-closed for login).
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
    // Lockout window expired — fall through. Counter stays; clears only on
    // successful login or TTL expiry.
  }

  // 2. Sliding window.
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

  // 3. Fail-closed if Redis degraded AND no local snapshot. Blocks a botnet
  //    piling on an instance whose Redis link just dropped.
  if (resolveStore() && isRedisDegraded(key) && !entry && !lockEntry) {
    throw serviceUnavailable('Authentication temporarily unavailable. Please retry shortly.', {
      retryAfterSec: 5,
      code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
    });
  }
};

/**
 * Sync bumps local snapshots; fires background Redis ops that mirror
 * authoritative counts back so peer-instance failures become visible here.
 */
export const recordFailedLogin = (email: string): void => {
  const key = normalize(email);
  const now = Date.now();

  // 1. Sync sliding window.
  const entry = slidingStore.get(key);
  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    slidingStore.set(key, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }

  // 2. Sync lockout counter.
  const lockEntry = lockoutStore.get(key);
  if (!lockEntry) {
    lockoutStore.set(key, { failures: 1, lastFailureAt: now });
  } else {
    lockEntry.failures += 1;
    lockEntry.lastFailureAt = now;
  }

  const store = resolveStore();
  if (!store) return;

  // 3. Background Redis sliding window (atomic Lua INCR+PEXPIRE).
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

  // 4. Background atomic lockout counter (Lua EVAL).
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
 * Atomic Lua EVAL so INCR + PEXPIRE cannot be split across instances (classic
 * race leaking a TTL-less counter, pinning memory indefinitely).
 *
 * @returns counter value, or `null` if EVAL fails.
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

/** Called on successful login. Sync clears local + background Redis DELs. */
export const clearLoginAttempts = (email: string): void => {
  const key = normalize(email);
  slidingStore.delete(key);
  lockoutStore.delete(key);
  clearRedisDegraded(key);

  const store = resolveStore();
  if (!store) return;

  void store.reset(slidingRedisKey(key)).catch((err: unknown) => {
    logger.warn('login_rate_limit_clear_fallback', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
  });

  // Raw Redis client — store prefixes keys.
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
 * Test-only — clears local snapshots WITHOUT clearing the degraded marker.
 * Simulates "cold instance" while Redis still degraded → must trigger fail-closed 503.
 */
export const _clearLocalOnlyForTest = (email: string): void => {
  const key = normalize(email);
  slidingStore.delete(key);
  lockoutStore.delete(key);
};
