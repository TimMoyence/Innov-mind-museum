/**
 * Cache service interface for key-value caching with TTL support.
 * TTL semantics: values expire after `ttlSeconds`. A TTL of 0 means use the default.
 * Invalidation: use `del` for single keys or `delByPrefix` for pattern-based invalidation.
 */
/**
 * Optional Zod-compatible validator. We avoid importing `zod` from the port
 * directly so test fakes don't need to drag the Zod typings, but anything that
 * matches `safeParse(raw): { success: true, data: T } | { success: false }`
 * works at runtime.
 */
export interface CacheValueSchema<T> {
  safeParse(raw: unknown): { success: true; data: T } | { success: false };
}

/**
 * Cache port shared by Redis/memory/noop adapters. Backend code depends on
 * this surface so the implementation can be swapped for tests and dev without
 * Redis.
 */
export interface CacheService {
  /**
   * Retrieve a cached value by key. Returns `null` on miss or on schema
   * validation failure when a schema is supplied. When called without a
   * schema, the value is cast to T without runtime validation — callers
   * inherit the responsibility for ensuring the cached shape is safe.
   */
  get<T>(key: string, schema?: CacheValueSchema<T>): Promise<T | null>;

  /** Store a value under key with optional TTL in seconds. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains input
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /** Delete a single cached key. */
  del(key: string): Promise<void>;

  /** Delete all keys matching a prefix (e.g. `session:user:42:`). */
  delByPrefix(prefix: string): Promise<void>;

  /** Set a key only if it does not already exist (distributed lock pattern). Returns true if set. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains input
  setNx<T>(key: string, value: T, ttlSeconds: number): Promise<boolean>;

  /**
   * Atomically increments a numeric value by `amount` and (re)applies a TTL on
   * the key. Returns the new value after the increment, or `null` on failure
   * (callers should treat null as "skip this update" — the operation is
   * fail-soft, mirroring `set`/`del` semantics in this port).
   *
   * Used for cumulative counters where atomicity matters (e.g. multi-instance
   * guardrail-judge budget, rate-limit windows).
   */
  incrBy(key: string, amount: number, ttlSeconds: number): Promise<number | null>;

  /** Check if the cache backend is reachable. Returns true if healthy. */
  ping(): Promise<boolean>;

  /** Increment a member's score in a sorted set (popularity tracking). */
  zadd(key: string, member: string, increment: number): Promise<void>;

  /** Get top N members of a sorted set by score descending. */
  ztop(key: string, n: number): Promise<{ member: string; score: number }[]>;

  /** Release long-lived resources (timers, sockets). Called at process shutdown. */
  destroy?(): Promise<void>;
}
