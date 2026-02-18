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

export const byIp = (req: Parameters<RequestHandler>[0]): string => {
  return req.ip || req.header('x-forwarded-for') || 'unknown-ip';
};

export const bySession = (req: Parameters<RequestHandler>[0]): string => {
  const sessionId = req.params.id || req.body?.sessionId || req.header('x-session-id');
  return sessionId ? `session:${String(sessionId)}` : byIp(req);
};

export const clearRateLimitBuckets = (): void => {
  buckets.clear();
};
