import { logger } from '@shared/logger/logger';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

import type Redis from 'ioredis';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Lua script performing an atomic INCR + PEXPIRE + PTTL in a single Redis call.
 * Guarantees that concurrent increments from multiple instances cannot race
 * between the INCR and EXPIRE — which would leak a key without TTL and allow
 * an unbounded bucket to persist in Redis.
 *
 * KEYS[1] = bucket key
 * ARGV[1] = window TTL in ms
 *
 * Returns `[count, pttl]`.
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

/**
 * Redis-backed rate-limit store using an atomic Lua script for INCR + EXPIRE.
 * Falls back to an in-memory store when Redis is unavailable.
 */
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

  /**
   * Atomically increment the request count for a key within a time window.
   * Uses a Lua EVAL so INCR + PEXPIRE are guaranteed atomic across instances.
   *
   * @param key - Bucket key (will be prefixed with `ratelimit:`).
   * @param windowMs - Window duration in milliseconds.
   * @returns The current count after increment and the absolute reset timestamp.
   */
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

  /**
   * Exposes the underlying ioredis client so callers (e.g. the login lockout
   * counter) can run specialized atomic Lua scripts without duplicating the
   * connection lifecycle.
   *
   * @returns The underlying ioredis client.
   */
  getRedisClient(): Redis {
    return this.redis;
  }

  /**
   * Reset a specific key (e.g. after successful auth).
   *
   * @param key - Bucket key to delete (will be prefixed with `ratelimit:`).
   */
  async reset(key: string): Promise<void> {
    const redisKey = `${this.keyPrefix}${key}`;
    try {
      await this.redis.del(redisKey);
    } catch {
      // Best-effort
    }
    this.fallback.delete(key);
  }

  /** Stop the in-memory fallback sweep timer. */
  stopSweep(): void {
    this.fallback.stopSweep();
  }

  /** Clear the in-memory fallback store. */
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
