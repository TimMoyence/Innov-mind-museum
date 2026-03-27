/**
 * Cache service interface for key-value caching with TTL support.
 * TTL semantics: values expire after `ttlSeconds`. A TTL of 0 means use the default.
 * Invalidation: use `del` for single keys or `delByPrefix` for pattern-based invalidation.
 */
export interface CacheService {
  /** Retrieve a cached value by key. Returns `null` on miss. */

  get<T>(key: string): Promise<T | null>;

  /** Store a value under key with optional TTL in seconds. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /** Delete a single cached key. */
  del(key: string): Promise<void>;

  /** Delete all keys matching a prefix (e.g. `session:user:42:`). */
  delByPrefix(prefix: string): Promise<void>;

  /** Set a key only if it does not already exist (distributed lock pattern). Returns true if set. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  setNx<T>(key: string, value: T, ttlSeconds: number): Promise<boolean>;
}
