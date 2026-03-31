import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';
import type { NextFunction, Request, Response } from 'express';

interface DailyBucket {
  count: number;
  /** ISO date string (YYYY-MM-DD) this bucket belongs to. */
  dateStr: string;
}

const store = new InMemoryBucketStore<DailyBucket>({
  // Expire entries from previous calendar days.
  isExpired: (entry) => entry.dateStr !== todayStr(),
});

/** Returns today's date as YYYY-MM-DD (UTC). */
const todayStr = (): string => new Date().toISOString().slice(0, 10);

/** Shared cache service for distributed daily-limit counting. */
let cacheService: CacheService | null = null;

/**
 * Register a CacheService for distributed daily-limit counting.
 * When set, the middleware will use Redis-backed counting with in-memory fallback.
 */
export const setDailyChatLimitCacheService = (cs: CacheService): void => {
  cacheService = cs;
};

/**
 * Resets the cache service reference. Intended for test teardown only.
 *
 * @internal
 */
export const _resetDailyChatLimitCacheService = (): void => {
  cacheService = null;
};

/** Seconds remaining until midnight UTC — used as Redis key TTL. */
const secondsUntilMidnightUtc = (): number => {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
};

/**
 * In-memory daily-limit check (synchronous). Used as primary path when no
 * CacheService is configured, or as fallback when Redis fails.
 */
const checkInMemory = (key: string, limit: number, dateStr: string, next: NextFunction): void => {
  const current = store.get(key);

  if (current?.dateStr === dateStr) {
    if (current.count >= limit) {
      next(
        new AppError({
          message: 'Daily chat limit reached',
          statusCode: 429,
          code: 'DAILY_LIMIT_REACHED',
          details: { limit },
        }),
      );
      return;
    }

    current.count += 1;
    store.set(key, current);
    next();
    return;
  }

  // First message today for this user.
  store.set(key, { count: 1, dateStr });
  next();
};

/**
 * Creates a middleware that enforces a daily chat message limit per authenticated user.
 * Must be applied AFTER `isAuthenticated` so that `req.user` is available.
 *
 * When a CacheService is registered (via `setDailyChatLimitCacheService`), counting is
 * distributed via Redis. Falls back to the in-memory store when Redis is unavailable.
 *
 * When the limit is reached, responds with 429 and a JSON body containing
 * `{ code: 'DAILY_LIMIT_REACHED', limit, message }`.
 */
export const dailyChatLimit = (req: Request, _res: Response, next: NextFunction): void => {
  const user = (req as Request & { user?: { id?: number } }).user;

  if (!user?.id) {
    next();
    return;
  }

  const limit = Math.max(1, env.freeTierDailyChatLimit);
  const dateStr = todayStr();
  const key = `daily-chat:${String(user.id)}:${dateStr}`;

  if (!cacheService) {
    checkInMemory(key, limit, dateStr, next);
    return;
  }

  // Distributed path: use Redis for counting.
  // Capture in local const so TypeScript knows it stays non-null inside the async chain.
  const cache = cacheService;
  void cache
    .get<number>(key)
    .then((cachedCount) => {
      const count = cachedCount ?? 0;

      if (count >= limit) {
        next(
          new AppError({
            message: 'Daily chat limit reached',
            statusCode: 429,
            code: 'DAILY_LIMIT_REACHED',
            details: { limit },
          }),
        );
        return;
      }

      const ttl = secondsUntilMidnightUtc();
      return cache.set(key, count + 1, ttl).then(() => {
        // Keep in-memory store in sync for fallback
        store.set(key, { count: count + 1, dateStr });
        next();
      });
    })
    .catch(() => {
      // Redis failed — fall back to in-memory counting
      logger.warn('daily_chat_limit_redis_fallback', { userId: user.id });
      checkInMemory(key, limit, dateStr, next);
    });
};

/** Clears all daily-limit buckets and stops the sweep timer. Intended for test teardown. */
export const clearDailyChatLimitBuckets = (): void => {
  store.clear();
};
