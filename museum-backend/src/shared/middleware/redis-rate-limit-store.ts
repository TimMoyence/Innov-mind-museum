import { logger } from '@shared/logger/logger';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

import type Redis from 'ioredis';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Atomic INCR + PEXPIRE + PTTL in one Redis call. Prevents race between INCR + EXPIRE
 * across instances → would leak TTL-less key + unbounded bucket persistence.
 * KEYS[1]=key, ARGV[1]=windowMs. Returns [count, pttl].
 */
const INCR_EXPIRE_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  return {count, tonumber(ARGV[1])}
end
local pttl = redis.call('PTTL', KEYS[1])
if pttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  pttl = tonumber(ARGV[1])
end
return {count, pttl}
`;

/** In-memory fallback when Redis unavailable. */
export class RedisRateLimitStore {
  private readonly redis: Redis;
  private readonly fallback: InMemoryBucketStore<Bucket>;
  private readonly keyPrefix = 'ratelimit:';

  constructor(redis: Redis) {
    this.redis = redis;
    this.fallback = new InMemoryBucketStore<Bucket>({
      isExpired: (entry, now) => entry.resetAt <= now,
    });
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const redisKey = `${this.keyPrefix}${key}`;

    try {
      const result = (await this.redis.eval(INCR_EXPIRE_LUA, 1, redisKey, String(windowMs))) as [
        number,
        number,
      ];

      const count = result[0];
      const pttl = result[1];
      const resetAt = Date.now() + Math.max(pttl, 0);
      return { count, resetAt };
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

  private incrementFallback(key: string, windowMs: number): { count: number; resetAt: number } {
    const now = Date.now();
    const current = this.fallback.get(key);

    if (!current || current.resetAt <= now) {
      const bucket = { count: 1, resetAt: now + windowMs };
      this.fallback.set(key, bucket);
      return bucket;
    }

    current.count += 1;
    this.fallback.set(key, current);
    return { count: current.count, resetAt: current.resetAt };
  }
}
