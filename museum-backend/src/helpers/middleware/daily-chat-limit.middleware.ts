import { AppError } from '@shared/errors/app.error';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';
import { env } from '@src/config/env';

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

/**
 * Creates a middleware that enforces a daily chat message limit per authenticated user.
 * Must be applied AFTER `isAuthenticated` so that `req.user` is available.
 *
 * When the limit is reached, responds with 429 and a JSON body containing
 * `{ code: 'DAILY_LIMIT_REACHED', limit, message }`.
 *
 * @returns Express request handler.
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

/** Clears all daily-limit buckets and stops the sweep timer. Intended for test teardown. */
export const clearDailyChatLimitBuckets = (): void => {
  store.clear();
};
