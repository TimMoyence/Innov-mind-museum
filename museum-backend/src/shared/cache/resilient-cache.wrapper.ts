import { logger } from '@shared/logger/logger';

import type { CacheService } from './cache.port';

/**
 * Wraps any {@link CacheService} so that backend failures (Redis ECONNREFUSED,
 * timeouts, malformed payloads, etc.) degrade gracefully instead of bubbling up
 * as 500s. Read ops return `null` on failure (treated as cache miss). Write +
 * delete ops swallow the error. `ping` returns `false`.
 *
 * Banking-grade contract: cache is a performance accelerator, not a primary
 * dependency — request handlers must keep working when Redis is unreachable.
 */
export class ResilientCacheWrapper implements CacheService {
  /**
   * Wraps the given inner cache so its failures degrade gracefully.
   *
   * @param inner - Underlying cache implementation whose failures should be silenced.
   */
  constructor(private readonly inner: CacheService) {}

  /** Read; returns null on backend failure (cache-miss semantics). */
  async get<T>(key: string): Promise<T | null> {
    try {
      return await this.inner.get<T>(key);
    } catch (err) {
      this.warn('cache_get_failed', key, err);
      return null;
    }
  }

  /** Write; swallows backend failure. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains input
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      await this.inner.set(key, value, ttlSeconds);
    } catch (err) {
      this.warn('cache_set_failed', key, err);
    }
  }

  /** Delete; swallows backend failure. */
  async del(key: string): Promise<void> {
    try {
      await this.inner.del(key);
    } catch (err) {
      this.warn('cache_del_failed', key, err);
    }
  }

  /** Prefix-delete; swallows backend failure. */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      await this.inner.delByPrefix(prefix);
    } catch (err) {
      this.warn('cache_del_prefix_failed', prefix, err);
    }
  }

  /** Conditional-set; returns false on backend failure (lock-not-acquired semantics). */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains input
  async setNx<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    try {
      return await this.inner.setNx(key, value, ttlSeconds);
    } catch (err) {
      this.warn('cache_setnx_failed', key, err);
      return false;
    }
  }

  /** Atomic numeric increment with TTL; returns null on backend failure. */
  async incrBy(key: string, amount: number, ttlSeconds: number): Promise<number | null> {
    try {
      return await this.inner.incrBy(key, amount, ttlSeconds);
    } catch (err) {
      this.warn('cache_incrby_failed', key, err);
      return null;
    }
  }

  /** Health probe; returns false on backend failure (treat as unreachable). */
  async ping(): Promise<boolean> {
    try {
      return await this.inner.ping();
    } catch (err) {
      this.warn('cache_ping_failed', '', err);
      return false;
    }
  }

  /** Sorted-set increment; swallows backend failure. */
  async zadd(key: string, member: string, increment: number): Promise<void> {
    try {
      await this.inner.zadd(key, member, increment);
    } catch (err) {
      this.warn('cache_zadd_failed', key, err);
    }
  }

  /** Sorted-set top-N; returns empty array on backend failure. */
  async ztop(key: string, n: number): Promise<{ member: string; score: number }[]> {
    try {
      return await this.inner.ztop(key, n);
    } catch (err) {
      this.warn('cache_ztop_failed', key, err);
      return [];
    }
  }

  /** Resource cleanup; swallows backend failure. */
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
