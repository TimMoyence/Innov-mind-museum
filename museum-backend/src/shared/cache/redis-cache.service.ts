import Redis from 'ioredis';

import type { CacheService } from './cache.port';

interface RedisCacheOptions {
  /** Redis connection URL (e.g. redis://localhost:6379). */
  url: string;
  /** Optional password — overrides any password embedded in the URL. */
  password?: string;
  /** Default TTL in seconds when not specified per-call. */
  defaultTtlSeconds?: number;
}

/** Redis-backed cache service with JSON serialization and prefix-based deletion. */
export class RedisCacheService implements CacheService {
  private readonly redis: Redis;
  private readonly defaultTtl: number;

  constructor(options: RedisCacheOptions) {
    this.redis = new Redis(options.url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: false,
      ...(options.password ? { password: options.password } : {}),
    });
    this.defaultTtl = options.defaultTtlSeconds ?? 300;
  }

  /** Opens the Redis connection. */
  async connect(): Promise<void> {
    await this.redis.connect();
  }

  /** Gracefully closes the Redis connection. */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  /** Retrieves and deserializes a cached value by key, returning null on miss or error. */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** Serializes and stores a value with an optional TTL (defaults to the configured default). */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- matches CacheService interface signature
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtl;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      // Cache write failure is non-fatal
    }
  }

  /** Deletes a single cached entry by key. */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      // Cache delete failure is non-fatal
    }
  }

  /** Scans and deletes all keys matching a given prefix. */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // Cache prefix delete failure is non-fatal
    }
  }

  /** Atomically sets a key only if it does not already exist (SET NX), with a TTL. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- matches CacheService interface signature
  async setNx<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }

  /** Check if Redis is reachable. */
  async ping(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  /** Increments a member's score in a sorted set using ZINCRBY. */
  async zadd(key: string, member: string, increment: number): Promise<void> {
    try {
      await this.redis.zincrby(key, increment, member);
    } catch {
      // Cache write failure is non-fatal
    }
  }

  /** Returns the top N members of a sorted set by score descending using ZREVRANGE. */
  async ztop(key: string, n: number): Promise<{ member: string; score: number }[]> {
    try {
      const raw = await this.redis.zrevrange(key, 0, n - 1, 'WITHSCORES');
      const results: { member: string; score: number }[] = [];
      for (let i = 0; i < raw.length; i += 2) {
        results.push({ member: raw[i], score: Number(raw[i + 1]) });
      }
      return results;
    } catch {
      return [];
    }
  }
}
