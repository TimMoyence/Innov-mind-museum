import { AppError, tooManyRequests } from '@shared/errors/app.error';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { onInputRejected } from '@shared/middleware/input-rejected';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';
import { env } from '@src/config/env';

import { releaseCountedUnit } from './redis-rate-limit-store';

import type { RateLimitBucket, RedisRateLimitStore } from './redis-rate-limit-store';
import type { Request, RequestHandler } from 'express';

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
  windowMs: number | ((req: Parameters<RequestHandler>[0]) => number);
  keyGenerator: (req: Parameters<RequestHandler>[0]) => string | null;
  bucketName?: string;
  errorCode?: string;
  errorMessage?: string;
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
  failClosed: boolean;
}

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

const handleRedisFailure = (redisError: unknown, ctx: BucketContext): void => {
  const { key, res, next, failClosed } = ctx;
  if (failClosed) {
    logger.error('rate_limit_redis_unavailable_failclosed', {
      key,
      error: errorMessage(redisError),
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
  const namespace = bucketName ?? nextAnonymousBucketName();
  const usePrefix = namespace !== '';
  const capError: CapError = {
    code: errorCode ?? null,
    message: errorMessage ?? null,
    statusCode: statusCode ?? null,
  };
  return (req, res, next) => {
    const rawKey = keyGenerator(req);
    if (rawKey === null) {
      next();
      return;
    }
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
  return req.ip ?? (req.socket as Request['socket'] | undefined)?.remoteAddress ?? 'unknown-ip';
};

export const bySession = (req: Parameters<RequestHandler>[0]): string => {
  const body = req.body as { sessionId?: string } | undefined;
  const sessionId = parseStringParam(req, 'id') ?? body?.sessionId ?? req.header('x-session-id');
  return sessionId ? `session:${sessionId}` : byIp(req);
};

export const byUserId = (req: Parameters<RequestHandler>[0]): string => {
  const user = (req as Request).user;
  return user?.id ? `user:${String(user.id)}` : byIp(req);
};

export const getBucketCountForKey = (key: string): number | undefined => {
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return undefined;
  return bucket.count;
};

export const clearRateLimitBuckets = (): void => {
  store.clear();
  redisStore?.clear();
};

export const stopRateLimitSweep = (): void => {
  store.stopSweep();
  redisStore?.stopSweep();
};

export const _resetRedisStore = (): void => {
  redisStore = null;
};
