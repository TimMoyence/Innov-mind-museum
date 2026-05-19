import { AppError, tooManyRequests } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';
import { env } from '@src/config/env';

import type { RedisRateLimitStore } from './redis-rate-limit-store';
import type { Request, RequestHandler } from 'express';

/** Retry-After seconds on fail-CLOSED. */
const FAIL_CLOSED_RETRY_AFTER_SECONDS = 30;

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new InMemoryBucketStore<Bucket>({
  isExpired: (entry, now) => entry.resetAt <= now,
});

let redisStore: RedisRateLimitStore | null = null;

export const setRedisRateLimitStore = (s: RedisRateLimitStore): void => {
  redisStore = s;
};

export const getRedisRateLimitStore = (): RedisRateLimitStore | null => redisStore;

interface RateLimitOptions {
  limit: number;
  windowMs: number;
  keyGenerator: (req: Parameters<RequestHandler>[0]) => string;
  /**
   * Distinct prefix per instance — limiters sharing keyGenerator (e.g. multiple `byIp`)
   * must not share bucket counters. Pass explicit name (e.g. `"register"`) for stable
   * Redis keys across deployments.
   */
  bucketName?: string;
}

let anonymousBucketSeq = 0;
const nextAnonymousBucketName = (): string => {
  anonymousBucketSeq += 1;
  return `anon-${String(anonymousBucketSeq)}`;
};

type Next = Parameters<RequestHandler>[2];
type Res = Parameters<RequestHandler>[1];

interface BucketContext {
  key: string;
  limit: number;
  windowMs: number;
  res: Res;
  next: Next;
}

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
 * F2 — failClosed=true (prod): 503 + Sentry alert. failClosed=false (dev):
 * degrade to per-instance memory bucket.
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

export const byIp = (req: Parameters<RequestHandler>[0]): string => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: req.ip may be undefined behind certain proxy configurations
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown-ip';
};

/** Session-prefixed key, falls back to IP. */
export const bySession = (req: Parameters<RequestHandler>[0]): string => {
  const body = req.body as { sessionId?: string } | undefined;
  const sessionId = parseStringParam(req, 'id') ?? body?.sessionId ?? req.header('x-session-id');
  return sessionId ? `session:${sessionId}` : byIp(req);
};

/** Ordering: AFTER auth middleware (req.user required). Falls back to IP. */
export const byUserId = (req: Parameters<RequestHandler>[0]): string => {
  const user = (req as Request).user;
  return user?.id ? `user:${String(user.id)}` : byIp(req);
};

// @internal — test-only helper: returns the current count for a bucket key in the in-memory store, or undefined if the bucket has not been created or has expired.
export const getBucketCountForKey = (key: string): number | undefined => {
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return undefined;
  return bucket.count;
};

/** @internal */
export const clearRateLimitBuckets = (): void => {
  store.clear();
  redisStore?.clear();
};

/** Graceful shutdown. */
export const stopRateLimitSweep = (): void => {
  store.stopSweep();
  redisStore?.stopSweep();
};

/** @internal */
export const _resetRedisStore = (): void => {
  redisStore = null;
};
