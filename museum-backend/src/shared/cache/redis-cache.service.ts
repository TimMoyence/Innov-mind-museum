import Redis from 'ioredis';

import type { CacheService, CacheValueSchema } from './cache.port';

interface RedisCacheOptions {
  url: string;
  password?: string;
  defaultTtlSeconds?: number;
}

export class RedisCacheService implements CacheService {
  private readonly redis: Redis;
  private readonly defaultTtl: number;

  constructor(options: RedisCacheOptions) {
    this.redis = new Redis(options.url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      reconnectOnError: (err) => (err.message.includes('READONLY') ? 2 : false),
      ...(options.password ? { password: options.password } : {}),
    });
    this.defaultTtl = options.defaultTtlSeconds ?? 300;
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  async destroy(): Promise<void> {
    await this.disconnect();
  }

  async get<T>(key: string, schema?: CacheValueSchema<T>): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (schema) {
        const result = schema.safeParse(parsed);
        return result.success ? result.data : null;
      }
      return parsed as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtl;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {}
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {}
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
    } catch {}
  }

  async setNx(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }

  async incrBy(key: string, amount: number, ttlSeconds: number): Promise<number | null> {
    if (!Number.isFinite(amount) || amount === 0) return null;
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return null;

    const lua =
      "local v = redis.call('INCRBY', KEYS[1], ARGV[1]); redis.call('EXPIRE', KEYS[1], ARGV[2]); return v";
    try {
      const result = await this.redis.eval(
        lua,
        1,
        key,
        String(Math.trunc(amount)),
        String(Math.trunc(ttlSeconds)),
      );
      const numeric = typeof result === 'number' ? result : Number(result);
      return Number.isFinite(numeric) ? numeric : null;
    } catch {
      return null;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  async zadd(key: string, member: string, increment: number): Promise<void> {
    try {
      await this.redis.zincrby(key, increment, member);
    } catch {}
  }

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
