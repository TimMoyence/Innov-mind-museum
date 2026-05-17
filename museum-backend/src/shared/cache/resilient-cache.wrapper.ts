import { logger } from '@shared/logger/logger';

import type { CacheService, CacheValueSchema } from './cache.port';

/**
 * Wraps {@link CacheService} so backend failures (ECONNREFUSED, timeouts,
 * malformed payloads) degrade gracefully instead of bubbling 500s. Read ops
 * return null (cache miss); write/delete ops swallow; `ping` returns false.
 * Banking contract: cache is performance accelerator, not primary dep —
 * handlers must work when Redis unreachable.
 */
export class ResilientCacheWrapper implements CacheService {
  constructor(private readonly inner: CacheService) {}

  async get<T>(key: string, schema?: CacheValueSchema<T>): Promise<T | null> {
    try {
      return await this.inner.get<T>(key, schema);
    } catch (err) {
      this.warn('cache_get_failed', key, err);
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains input
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      await this.inner.set(key, value, ttlSeconds);
    } catch (err) {
      this.warn('cache_set_failed', key, err);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.inner.del(key);
    } catch (err) {
      this.warn('cache_del_failed', key, err);
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      await this.inner.delByPrefix(prefix);
    } catch (err) {
      this.warn('cache_del_prefix_failed', prefix, err);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains input
  async setNx<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    try {
      return await this.inner.setNx(key, value, ttlSeconds);
    } catch (err) {
      this.warn('cache_setnx_failed', key, err);
      return false;
    }
  }

  async incrBy(key: string, amount: number, ttlSeconds: number): Promise<number | null> {
    try {
      return await this.inner.incrBy(key, amount, ttlSeconds);
    } catch (err) {
      this.warn('cache_incrby_failed', key, err);
      return null;
    }
  }

  async ping(): Promise<boolean> {
    try {
      return await this.inner.ping();
    } catch (err) {
      this.warn('cache_ping_failed', '', err);
      return false;
    }
  }

  async zadd(key: string, member: string, increment: number): Promise<void> {
    try {
      await this.inner.zadd(key, member, increment);
    } catch (err) {
      this.warn('cache_zadd_failed', key, err);
    }
  }

  async ztop(key: string, n: number): Promise<{ member: string; score: number }[]> {
    try {
      return await this.inner.ztop(key, n);
    } catch (err) {
      this.warn('cache_ztop_failed', key, err);
      return [];
    }
  }

  async destroy(): Promise<void> {
    try {
      await this.inner.destroy?.();
    } catch (err) {
      this.warn('cache_destroy_failed', '', err);
    }
  }

  private warn(event: string, key: string, err: unknown): void {
    logger.warn(event, {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
