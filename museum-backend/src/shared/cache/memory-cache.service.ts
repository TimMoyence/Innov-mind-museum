import { logger } from '@shared/logger/logger';

import type { CacheService } from './cache.port';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * In-memory cache with TTL support.
 * Used as fallback when Redis is not available (CACHE_ENABLED=false).
 * Prevents hammering external APIs (Overpass, etc.) with duplicate requests.
 *
 * Not suitable for multi-instance deployments — each process has its own cache.
 */
export class MemoryCacheService implements CacheService {
  private readonly store = new Map<string, CacheEntry>();
  private readonly defaultTtlSeconds: number;
  private readonly maxEntries: number;
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts?: { defaultTtlSeconds?: number; maxEntries?: number }) {
    this.defaultTtlSeconds = opts?.defaultTtlSeconds ?? 3600;
    this.maxEntries = opts?.maxEntries ?? 5000;

    // Evict expired entries every 60s to prevent unbounded growth.
    this.gcTimer = setInterval(() => {
      this.evictExpired();
    }, 60_000);
    this.gcTimer.unref();
  }

  /** Retrieves a value by key, returning null on miss or expiry. */
  // eslint-disable-next-line @typescript-eslint/require-await -- synchronous Map lookup must match async CacheService interface
  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /** Stores a value with TTL. Evicts oldest entry at capacity. */
  // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-parameters -- synchronous Map write must match async CacheService interface; T constrains input per interface contract
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }

    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : this.defaultTtlSeconds;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  /** Deletes a single cached key. */
  // eslint-disable-next-line @typescript-eslint/require-await -- synchronous Map delete must match async CacheService interface
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Deletes all keys matching a prefix. */
  // eslint-disable-next-line @typescript-eslint/require-await -- synchronous Map iteration must match async CacheService interface
  async delByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /** Sets key only if absent (in-process lock pattern). */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T constrains input per interface contract
  async setNx<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    const existing = await this.get(key);
    if (existing !== null) return false;

    await this.set(key, value, ttlSeconds);
    return true;
  }

  /** Always returns true — in-memory cache is always reachable. */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match async CacheService interface
  async ping(): Promise<boolean> {
    return true;
  }

  /** Increments a member score in a sorted-set-like structure. */
  async zadd(key: string, member: string, increment: number): Promise<void> {
    const sorted = (await this.get<Record<string, number>>(key)) ?? {};
    sorted[member] = (sorted[member] ?? 0) + increment;
    await this.set(key, sorted, this.defaultTtlSeconds);
  }

  /** Returns top N members by score descending. */
  async ztop(key: string, n: number): Promise<{ member: string; score: number }[]> {
    const sorted = (await this.get<Record<string, number>>(key)) ?? {};
    return Object.entries(sorted)
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }

  private evictExpired(): void {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      logger.info('memory_cache_gc', { evicted, remaining: this.store.size });
    }
  }

  /** Clears the GC timer and empties the store. Safe to call multiple times. */
  // eslint-disable-next-line @typescript-eslint/require-await -- matches async CacheService.destroy signature
  async destroy(): Promise<void> {
    if (this.gcTimer !== null) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    this.store.clear();
  }
}
