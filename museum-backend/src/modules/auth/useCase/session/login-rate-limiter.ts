import { createHash } from 'node:crypto';

import { serviceUnavailable, tooManyRequests } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { getRedisRateLimitStore } from '@shared/middleware/rate-limit.middleware';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

import type { RedisRateLimitStore } from '@shared/middleware/redis-rate-limit-store';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;
const KEY_PREFIX = 'login-attempts:';

const LOCKOUT_THRESHOLD = 5;
const BASE_LOCKOUT_MS = 30 * 1000;
const MAX_LOCKOUT_MS = 15 * 60 * 1000;
const LOCKOUT_COUNTER_TTL_MS = 24 * 60 * 60 * 1000;
const LOCKOUT_KEY_PREFIX = 'auth:lockout:';

const DEGRADED_WINDOW_MS = 30 * 1000;

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

const degradedUntil = new Map<string, number>();

let overrideStore: RedisRateLimitStore | null | undefined;

export const setLoginRateLimitStore = (store: RedisRateLimitStore | null): void => {
  overrideStore = store;
};

const resolveStore = (): RedisRateLimitStore | null => {
  if (overrideStore !== undefined) return overrideStore;
  return getRedisRateLimitStore();
};

const normalize = (email: string): string => email.toLowerCase().trim();

const hashEmailForKey = (email: string): string => createHash('sha1').update(email).digest('hex');

const slidingRedisKey = (email: string): string => `${KEY_PREFIX}${hashEmailForKey(email)}`;

const lockoutRedisKey = (email: string): string => `${LOCKOUT_KEY_PREFIX}${hashEmailForKey(email)}`;

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

export const checkLoginRateLimit = (email: string): void => {
  const key = normalize(email);
  const now = Date.now();

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
  }

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

  if (resolveStore() && isRedisDegraded(key) && !entry && !lockEntry) {
    throw serviceUnavailable('Authentication temporarily unavailable. Please retry shortly.', {
      retryAfterSec: 5,
      code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
    });
  }
};

export const recordFailedLogin = (email: string): void => {
  const key = normalize(email);
  const now = Date.now();

  const entry = slidingStore.get(key);
  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    slidingStore.set(key, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }

  const lockEntry = lockoutStore.get(key);
  if (!lockEntry) {
    lockoutStore.set(key, { failures: 1, lastFailureAt: now });
  } else {
    lockEntry.failures += 1;
    lockEntry.lastFailureAt = now;
  }

  const store = resolveStore();
  if (!store) return;

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

  void clearLockoutCounter(store, lockoutRedisKey(key)).catch((err: unknown) => {
    logger.warn('login_rate_limit_lockout_clear_fallback', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
  });
};

const clearLockoutCounter = async (store: RedisRateLimitStore, key: string): Promise<void> => {
  try {
    await store.getRedisClient().del(key);
  } catch {}
};

export const _resetAllAttempts = (): void => {
  slidingStore.clear();
  lockoutStore.clear();
  degradedUntil.clear();
  overrideStore = null;
};

export const _clearLocalOnlyForTest = (email: string): void => {
  const key = normalize(email);
  slidingStore.delete(key);
  lockoutStore.delete(key);
};
