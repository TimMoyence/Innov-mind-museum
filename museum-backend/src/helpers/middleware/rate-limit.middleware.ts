import type { RequestHandler } from 'express';

import { tooManyRequests } from '@shared/errors/app.error';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

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
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
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
    buckets.set(key, current);
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

/** Clears all in-memory rate-limit buckets. Intended for test teardown. */
export const clearRateLimitBuckets = (): void => {
  buckets.clear();
};
