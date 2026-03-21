import type { Request, RequestHandler } from 'express';

import { tooManyRequests } from '@shared/errors/app.error';

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_MAP_SIZE = 100_000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const buckets = new Map<string, Bucket>();

/** Periodic sweep to evict expired buckets and prevent unbounded memory growth. */
let sweepTimer: ReturnType<typeof setInterval> | null = null;
const ensureSweep = (): void => {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
    if (buckets.size === 0 && sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, SWEEP_INTERVAL_MS);
  if (typeof sweepTimer === 'object' && 'unref' in sweepTimer) {
    sweepTimer.unref();
  }
};

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
      if (buckets.size >= MAX_MAP_SIZE) {
        const oldest = buckets.keys().next().value;
        if (oldest) buckets.delete(oldest);
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      ensureSweep();
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
  buckets.clear();
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
};

/** Stops the periodic sweep timer. Call during graceful shutdown. */
export const stopRateLimitSweep = (): void => {
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
};
