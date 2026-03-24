import type { Request, RequestHandler } from 'express';

import { tooManyRequests } from '@shared/errors/app.error';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new InMemoryBucketStore<Bucket>({
  isExpired: (entry, now) => entry.resetAt <= now,
});

interface RateLimitOptions {
  limit: number;
  windowMs: number;
  keyGenerator: (req: Parameters<RequestHandler>[0]) => string;
}

/**
 * Creates an in-memory sliding-window rate-limit middleware.
 * @param options - Limit, window duration, and key extraction strategy.
 * @returns Express middleware that rejects excess requests with 429.
 */
export const createRateLimitMiddleware = ({
  limit,
  windowMs,
  keyGenerator,
}: RateLimitOptions): RequestHandler => {
  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSec.toString());
      next(tooManyRequests('Too many requests. Please retry later.'));
      return;
    }

    current.count += 1;
    store.set(key, current);
    next();
  };
};

/**
 * Rate-limit key generator that identifies clients by IP address.
 * @param req - Express request.
 * @returns Client IP string used as the bucket key.
 */
export const byIp = (req: Parameters<RequestHandler>[0]): string => {
  return req.ip || req.socket?.remoteAddress || 'unknown-ip';
};

/**
 * Rate-limit key generator that identifies clients by chat session ID, falling back to IP.
 * @param req - Express request.
 * @returns Session-prefixed or IP-based bucket key.
 */
export const bySession = (req: Parameters<RequestHandler>[0]): string => {
  const sessionId = req.params.id || req.body?.sessionId || req.header('x-session-id');
  return sessionId ? `session:${String(sessionId)}` : byIp(req);
};

/**
 * Rate-limit key generator that identifies clients by authenticated user ID, falling back to IP.
 * Must be applied AFTER authentication middleware so that req.user is available.
 * @param req - Express request (with user set by auth middleware).
 * @returns User-prefixed or IP-based bucket key.
 */
export const byUserId = (req: Parameters<RequestHandler>[0]): string => {
  const user = (req as Request & { user?: { id?: number } }).user;
  return user?.id ? `user:${user.id}` : byIp(req);
};

/** Clears all in-memory rate-limit buckets and stops the sweep timer. Intended for test teardown. */
export const clearRateLimitBuckets = (): void => {
  store.clear();
};

/** Stops the periodic sweep timer. Call during graceful shutdown. */
export const stopRateLimitSweep = (): void => {
  store.stopSweep();
};
