import { logger } from '@shared/logger/logger';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

import type Redis from 'ioredis';

export interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface CountedUnit extends RateLimitBucket {
  release: () => Promise<void>;
}

export const releaseCountedUnit = (
  buckets: InMemoryBucketStore<RateLimitBucket>,
  key: string,
  bucket: RateLimitBucket,
): void => {
  if (buckets.get(key) === bucket && bucket.count > 0) bucket.count -= 1;
};

/**
 * Atomic INCR + PEXPIRE + PTTL in one Redis call. Prevents race between INCR + EXPIRE
 * across instances → would leak TTL-less key + unbounded bucket persistence.
 * KEYS[1]=key, ARGV[1]=windowMs. Returns [count, pttl, expireAtMs].
 */
const INCR_EXPIRE_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  return {count, tonumber(ARGV[1]), redis.call('PEXPIRETIME', KEYS[1])}
end
local pttl = redis.call('PTTL', KEYS[1])
if pttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  pttl = tonumber(ARGV[1])
end
return {count, pttl, redis.call('PEXPIRETIME', KEYS[1])}
`;

const DECR_IN_WINDOW_LUA = `
if redis.call('PEXPIRETIME', KEYS[1]) ~= tonumber(ARGV[1]) then
  return 0
end
local current = tonumber(redis.call('GET', KEYS[1]))
if current and current > 0 then
  return redis.call('DECR', KEYS[1])
end
return 0
`;

/** In-memory fallback when Redis unavailable. */
export class RedisRateLimitStore {
  private readonly redis: Redis;
  private readonly fallback: InMemoryBucketStore<RateLimitBucket>;
  private readonly keyPrefix = 'ratelimit:';

  constructor(redis: Redis) {
    this.redis = redis;
    this.fallback = new InMemoryBucketStore<RateLimitBucket>({
      isExpired: (entry, now) => entry.resetAt <= now,
    });
  }

  async increment(key: string, windowMs: number): Promise<CountedUnit> {
    const redisKey = `${this.keyPrefix}${key}`;

    try {
      const [count, pttl, expireAtMs] = (await this.redis.eval(
        INCR_EXPIRE_LUA,
        1,
        redisKey,
        String(windowMs),
      )) as [number, number, number];
      const resetAt = Date.now() + Math.max(pttl, 0);
      return { count, resetAt, release: () => this.releaseRedisUnit(redisKey, expireAtMs) };
    } catch (err) {
      logger.warn('redis_rate_limit_fallback', {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: err may not be Error at runtime
        reason: (err as Error).message ?? 'unknown',
        key,
      });
      return this.incrementFallback(key, windowMs);
    }
  }

  /** Exposes ioredis so callers (login lockout) can run specialized Lua scripts. */
  getRedisClient(): Redis {
    return this.redis;
  }

  /** e.g. after successful auth. */
  async reset(key: string): Promise<void> {
    const redisKey = `${this.keyPrefix}${key}`;
    try {
      await this.redis.del(redisKey);
    } catch {
      // Best-effort
    }
    this.fallback.delete(key);
  }

  stopSweep(): void {
    this.fallback.stopSweep();
  }

  clear(): void {
    this.fallback.clear();
  }

  private async releaseRedisUnit(redisKey: string, expireAtMs: number): Promise<void> {
    try {
      await this.redis.eval(DECR_IN_WINDOW_LUA, 1, redisKey, String(expireAtMs));
    } catch (err) {
      logger.warn('redis_rate_limit_refund_failed', {
        reason: err instanceof Error ? err.message : String(err),
        key: redisKey,
      });
    }
  }

  private incrementFallback(key: string, windowMs: number): CountedUnit {
    const now = Date.now();
    const current = this.fallback.get(key);
    const bucket =
      !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    this.fallback.set(key, bucket);
    return {
      count: bucket.count,
      resetAt: bucket.resetAt,
      release: () => {
        releaseCountedUnit(this.fallback, key, bucket);
        return Promise.resolve();
      },
    };
  }
}
