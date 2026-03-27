import { logger } from '@shared/logger/logger';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

import type Redis from 'ioredis';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Redis-backed rate-limit store using atomic INCR + EXPIRE.
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
   *
   * @returns The current count after increment and the TTL remaining in ms.
   */
  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const redisKey = `${this.keyPrefix}${key}`;

    try {
      const results = await this.redis.multi().incr(redisKey).pttl(redisKey).exec();

      if (!results) {
        return this.incrementFallback(key, windowMs);
      }

      const [incrResult, pttlResult] = results;

      // ioredis multi().exec() returns [error, result][] — check for errors
      if (incrResult[0] || pttlResult[0]) {
        return this.incrementFallback(key, windowMs);
      }

      const count = incrResult[1] as number;
      const pttl = pttlResult[1] as number;

      // First request in this window: set expiry
      if (count === 1 || pttl < 0) {
        await this.redis.pexpire(redisKey, windowMs);
        return { count, resetAt: Date.now() + windowMs };
      }

      // pttl is the remaining TTL in ms
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

  /** Reset a specific key (e.g. after successful auth). */
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
