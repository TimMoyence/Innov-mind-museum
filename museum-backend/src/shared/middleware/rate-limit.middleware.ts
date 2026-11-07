import { AppError, tooManyRequests } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { onInputRejected } from '@shared/middleware/input-rejected';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';
import { env } from '@src/config/env';

import { releaseCountedUnit } from './redis-rate-limit-store';

import type { RateLimitBucket, RedisRateLimitStore } from './redis-rate-limit-store';
import type { Request, RequestHandler } from 'express';

/** Retry-After seconds on fail-CLOSED. */
const FAIL_CLOSED_RETRY_AFTER_SECONDS = 30;

const store = new InMemoryBucketStore<RateLimitBucket>({
  isExpired: (entry, now) => entry.resetAt <= now,
});

let redisStore: RedisRateLimitStore | null = null;

export const setRedisRateLimitStore = (s: RedisRateLimitStore): void => {
  redisStore = s;
};

export const getRedisRateLimitStore = (): RedisRateLimitStore | null => redisStore;

interface RateLimitOptions {
  limit: number;
  /**
   * Window in ms. Pass a function to resolve per-request (e.g. seconds-until-
   * midnight for a calendar-day reset). PR-11 (R7).
   */
  windowMs: number | ((req: Parameters<RequestHandler>[0]) => number);
  /**
   * Bucket key extractor. Return `null` to skip the middleware entirely (no
   * counter read/write, `next()` called clean). Useful for anonymous requests
   * on auth-gated limiters. PR-11 (R2.1).
   */
  keyGenerator: (req: Parameters<RequestHandler>[0]) => string | null;
  /**
   * Distinct prefix per instance — limiters sharing keyGenerator (e.g. multiple `byIp`)
   * must not share bucket counters. Pass explicit name (e.g. `"register"`) for stable
   * Redis keys across deployments. Empty string opts OUT of the prefix entirely
   * (forwards the raw keyGenerator output as the Redis key). PR-11 (R8).
   */
  bucketName?: string;
  /**
   * Custom AppError `code` on cap (default `'TOO_MANY_REQUESTS'`). When set,
   * `details: { limit }` is attached for clients that branch on the cap value.
   * PR-11 (R1).
   */
  errorCode?: string;
  /** Custom AppError `message` on cap (default `'Too many requests. Please retry later.'`). PR-11 (R1). */
  errorMessage?: string;
  /** Custom HTTP status on cap (default `429`). PR-11 (R1). */
  statusCode?: 429 | 402;
  countRejected?: boolean;
}

let anonymousBucketSeq = 0;
const nextAnonymousBucketName = (): string => {
  anonymousBucketSeq += 1;
  return `anon-${String(anonymousBucketSeq)}`;
};

type Next = Parameters<RequestHandler>[2];
type Res = Parameters<RequestHandler>[1];

interface CapError {
  /** Pre-resolved cap-error fields (PR-11 R1). `null` → use default tooManyRequests(). */
  code: string | null;
  message: string | null;
  statusCode: 429 | 402 | null;
}

interface BucketContext {
  key: string;
  limit: number;
  windowMs: number;
  res: Res;
  next: Next;
  admit: (release: () => void) => void;
  capError: CapError;
  /**
   * Snapshot of `env.rateLimit.failClosed` captured at request entry. Reading
   * eagerly (sync) avoids a TOCTOU between handler invocation and the deferred
   * catch microtask — tests that pin env for the duration of the handler call
   * (e.g. `withFailClosed(...)`) only see the pinned value if we read it
   * before the catch is awaited.
   */
  failClosed: boolean;
}

/** Build the cap AppError, honouring custom error fields when configured (PR-11 R1). */
const buildCapError = (limit: number, capError: CapError): AppError => {
  if (capError.code !== null) {
    return new AppError({
      message: capError.message ?? 'Too many requests. Please retry later.',
      statusCode: capError.statusCode ?? 429,
      code: capError.code,
      details: { limit },
    });
  }
  return tooManyRequests('Too many requests. Please retry later.');
};

const rejectOverCap = ({ limit, res, next, capError }: BucketContext, resetAt: number): void => {
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', retryAfterSec.toString());
  next(buildCapError(limit, capError));
};

const consumeMemoryBucket = (ctx: BucketContext): void => {
  const { key, limit, windowMs, admit } = ctx;
  const now = Date.now();
  const current = store.get(key);
  const open = current && current.resetAt > now ? current : null;

  if (open && open.count >= limit) {
    rejectOverCap(ctx, open.resetAt);
    return;
  }

  const bucket = open ?? { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  store.set(key, bucket);
  admit(() => {
    releaseCountedUnit(store, key, bucket);
  });
};

/**
 * F2 — failClosed=true (prod): 503 + Sentry alert. failClosed=false (dev):
 * degrade to per-instance memory bucket.
 */
const handleRedisFailure = (redisError: unknown, ctx: BucketContext): void => {
  const { key, res, next, failClosed } = ctx;
  if (failClosed) {
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

const consumeRedisBucket = (redis: RedisRateLimitStore, ctx: BucketContext): void => {
  void redis
    .increment(ctx.key, ctx.windowMs)
    .then(({ count, resetAt, release }) => {
      if (count > ctx.limit) {
        rejectOverCap(ctx, resetAt);
        return;
      }
      ctx.admit(() => {
        void release();
      });
    })
    .catch((redisError: unknown) => {
      handleRedisFailure(redisError, ctx);
    });
};

export const createRateLimitMiddleware = ({
  limit,
  windowMs,
  keyGenerator,
  bucketName,
  errorCode,
  errorMessage,
  statusCode,
  countRejected = false,
}: RateLimitOptions): RequestHandler => {
  // PR-11 R8 — empty-string opts OUT of the namespace prefix. `undefined`
  // still falls back to a unique anon prefix (legacy behaviour). `??` is
  // intentional: empty string is a valid (opt-out) namespace, not a missing
  // value, so we must NOT trigger the anon fallback for `''`.
  const namespace = bucketName ?? nextAnonymousBucketName();
  const usePrefix = namespace !== '';
  const capError: CapError = {
    code: errorCode ?? null,
    message: errorMessage ?? null,
    statusCode: statusCode ?? null,
  };
  return (req, res, next) => {
    // PR-11 R2.1 — null key skips the middleware (no counter touched).
    const rawKey = keyGenerator(req);
    if (rawKey === null) {
      next();
      return;
    }
    // PR-11 R7 — windowMs may be a function resolved per-request.
    const resolvedWindowMs = typeof windowMs === 'function' ? windowMs(req) : windowMs;
    const key = usePrefix ? `${namespace}:${rawKey}` : rawKey;
    const admit = (release: () => void): void => {
      if (!countRejected) onInputRejected(res, release);
      next();
    };
    const ctx: BucketContext = {
      key,
      limit,
      windowMs: resolvedWindowMs,
      res,
      next,
      admit,
      capError,
      failClosed: env.rateLimit.failClosed,
    };

    if (redisStore) {
      consumeRedisBucket(redisStore, ctx);
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
