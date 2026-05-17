import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';
import type { NextFunction, Request, Response } from 'express';

interface DailyBucket {
  count: number;
  /** ISO YYYY-MM-DD (UTC). */
  dateStr: string;
}

const store = new InMemoryBucketStore<DailyBucket>({
  isExpired: (entry) => entry.dateStr !== todayStr(),
});

const todayStr = (): string => new Date().toISOString().slice(0, 10);

let cacheService: CacheService | null = null;

/** When set, distributed Redis counting with in-memory fallback. */
export const setDailyChatLimitCacheService = (cs: CacheService): void => {
  cacheService = cs;
};

/** @internal */
export const _resetDailyChatLimitCacheService = (): void => {
  cacheService = null;
};

const secondsUntilMidnightUtc = (): number => {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
};

/** Primary path when no CacheService; fallback when Redis fails. */
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

  store.set(key, { count: 1, dateStr });
  next();
};

/**
 * Ordering: AFTER `isAuthenticated` (`req.user` required).
 * 429 `{ code: 'DAILY_LIMIT_REACHED', limit, message }` on cap.
 */
export const dailyChatLimit = (req: Request, _res: Response, next: NextFunction): void => {
  const user = req.user;

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

  // Capture local const so TS narrows non-null inside async chain.
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
        // Keep in-memory store in sync for fallback.
        store.set(key, { count: count + 1, dateStr });
        next();
      });
    })
    .catch(() => {
      // Redis failed → in-memory fallback. Wrap to prevent sync throw becoming unhandled rejection.
      logger.warn('daily_chat_limit_redis_fallback', { userId: user.id });
      try {
        checkInMemory(key, limit, dateStr, next);
      } catch (err) {
        next(err instanceof Error ? err : new Error(String(err)));
      }
    });
};

/** @internal */
export const clearDailyChatLimitBuckets = (): void => {
  store.clear();
};
