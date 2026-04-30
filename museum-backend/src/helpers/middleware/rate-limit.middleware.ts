import { AppError, tooManyRequests } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';
import { env } from '@src/config/env';

import type { RedisRateLimitStore } from './redis-rate-limit-store';
import type { Request, RequestHandler } from 'express';

/** Retry-After header value (seconds) returned when failing closed on Redis outage. */
const FAIL_CLOSED_RETRY_AFTER_SECONDS = 30;

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new InMemoryBucketStore<Bucket>({
  isExpired: (entry, now) => entry.resetAt <= now,
});

/** Shared Redis rate-limit store, set once during app bootstrap. */
let redisStore: RedisRateLimitStore | null = null;

/**
 * Register a Redis-backed rate-limit store for distributed rate limiting.
 * When set, all rate-limit middleware instances will use Redis with in-memory fallback.
 */
export const setRedisRateLimitStore = (s: RedisRateLimitStore): void => {
  redisStore = s;
};

/** Returns the active Redis rate-limit store, or null if not configured. */
export const getRedisRateLimitStore = (): RedisRateLimitStore | null => redisStore;

interface RateLimitOptions {
  limit: number;
  windowMs: number;
  keyGenerator: (req: Parameters<RequestHandler>[0]) => string;
  /**
   * Optional bucket namespace. Each middleware instance needs a distinct prefix so
   * limiters sharing the same keyGenerator (e.g. multiple `byIp` middlewares) do not
   * share the same bucket counter. Defaults to an auto-incremented sequence — callers
   * with a semantic name (e.g. `"register"`) should pass it explicitly for clarity
   * and for stable Redis keys across deployments.
   */
  bucketName?: string;
}

let anonymousBucketSeq = 0;
const nextAnonymousBucketName = (): string => {
  anonymousBucketSeq += 1;
  return `anon-${String(anonymousBucketSeq)}`;
};

/**
 * Creates a sliding-window rate-limit middleware.
 * Uses Redis when a RedisRateLimitStore has been registered via `setRedisRateLimitStore`,
 * otherwise falls back to the in-memory bucket store.
 *
 * @param root0 - Rate-limit options.
 * @param root0.limit - Maximum number of requests per window.
 * @param root0.windowMs - Window duration in milliseconds.
 * @param root0.keyGenerator - Function to extract a bucket key from the request.
 * @param root0.bucketName - Optional bucket namespace for isolation from sibling limiters.
 * @returns Express middleware that rejects excess requests with 429.
 */
type Next = Parameters<RequestHandler>[2];
type Res = Parameters<RequestHandler>[1];

interface BucketContext {
  key: string;
  limit: number;
  windowMs: number;
  res: Res;
  next: Next;
}

/** Drains the in-memory bucket for `key`. */
const consumeMemoryBucket = (ctx: BucketContext): void => {
  const { key, limit, windowMs, res, next } = ctx;
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

/**
 * F2 — Handles a Redis-store rejection. Two paths:
 *   - failClosed=true  (prod default): respond 503 + Sentry alert.
 *   - failClosed=false (dev default): degrade to per-instance memory bucket.
 */
const handleRedisFailure = (redisError: unknown, ctx: BucketContext): void => {
  const { key, res, next } = ctx;
  if (env.rateLimit.failClosed) {
    logger.error('rate_limit_redis_unavailable_failclosed', {
      key,
      error: redisError instanceof Error ? redisError.message : String(redisError),
    });
    captureExceptionWithContext(
      redisError instanceof Error ? redisError : new Error(String(redisError)),
      { component: 'rate-limit', mode: 'fail-closed', key },
    );
    res.setHeader('Retry-After', FAIL_CLOSED_RETRY_AFTER_SECONDS.toString());
    next(
      new AppError({
        statusCode: 503,
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Rate limit service temporarily unavailable. Please retry shortly.',
      }),
    );
    return;
  }

  logger.warn('rate_limit_redis_unavailable_degraded_to_local_bucket', { key });
  consumeMemoryBucket(ctx);
};

export const createRateLimitMiddleware = ({
  limit,
  windowMs,
  keyGenerator,
  bucketName,
}: RateLimitOptions): RequestHandler => {
  const namespace = bucketName ?? nextAnonymousBucketName();
  return (req, res, next) => {
    const key = `${namespace}:${keyGenerator(req)}`;
    const ctx: BucketContext = { key, limit, windowMs, res, next };

    if (redisStore) {
      void redisStore
        .increment(key, windowMs)
        .then(({ count, resetAt }) => {
          if (count > limit) {
            const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
            res.setHeader('Retry-After', retryAfterSec.toString());
            next(tooManyRequests('Too many requests. Please retry later.'));
            return;
          }
          next();
        })
        .catch((redisError: unknown) => {
          handleRedisFailure(redisError, ctx);
        });
      return;
    }

    consumeMemoryBucket(ctx);
  };
};

/**
 * Rate-limit key generator that identifies clients by IP address.
 *
 * @param req - Express request.
 * @returns Client IP string used as the bucket key.
 */
export const byIp = (req: Parameters<RequestHandler>[0]): string => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: req.ip may be undefined behind certain proxy configurations
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown-ip';
};

/**
 * Rate-limit key generator that identifies clients by chat session ID, falling back to IP.
 *
 * @param req - Express request.
 * @returns Session-prefixed or IP-based bucket key.
 */
export const bySession = (req: Parameters<RequestHandler>[0]): string => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: params.id may be undefined; String() ensures type safety
  const sessionId = req.params.id ?? req.body?.sessionId ?? req.header('x-session-id');
  return sessionId ? `session:${sessionId}` : byIp(req);
};

/**
 * Rate-limit key generator that identifies clients by authenticated user ID, falling back to IP.
 * Must be applied AFTER authentication middleware so that req.user is available.
 *
 * @param req - Express request (with user set by auth middleware).
 * @returns User-prefixed or IP-based bucket key.
 */
export const byUserId = (req: Parameters<RequestHandler>[0]): string => {
  const user = (req as Request & { user?: { id?: number } }).user;
  return user?.id ? `user:${String(user.id)}` : byIp(req);
};

/** Clears all in-memory rate-limit buckets and stops the sweep timer. Intended for test teardown. */
export const clearRateLimitBuckets = (): void => {
  store.clear();
  redisStore?.clear();
};

/** Stops the periodic sweep timer. Call during graceful shutdown. */
export const stopRateLimitSweep = (): void => {
  store.stopSweep();
  redisStore?.stopSweep();
};

/**
 * Resets the Redis store reference. Intended for test teardown only.
 *
 * @internal
 */
export const _resetRedisStore = (): void => {
  redisStore = null;
};
