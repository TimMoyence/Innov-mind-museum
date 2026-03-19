import Redis from 'ioredis';

import type { CacheService } from './cache.port';

interface RedisCacheOptions {
  /** Redis connection URL (e.g. redis://localhost:6379). */
  url: string;
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
    });
    this.defaultTtl = options.defaultTtlSeconds ?? 300;
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtl;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      // Cache write failure is non-fatal
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      // Cache delete failure is non-fatal
    }
  }

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
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
