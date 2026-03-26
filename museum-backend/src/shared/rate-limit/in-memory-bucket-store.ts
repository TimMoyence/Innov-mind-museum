/**
 * Generic in-memory bucket store with periodic sweep and bounded size.
 * Used by rate-limit middleware and login rate limiter to avoid code duplication.
 *
 * @template T - Shape of a bucket entry.
 */

interface InMemoryBucketStoreOptions<T> {
  /** Maximum number of entries before oldest-first eviction (default: 100_000). */
  maxSize?: number;
  /** Interval between sweep passes in ms (default: 5 min). */
  sweepIntervalMs?: number;
  /** Predicate to determine if an entry has expired and should be swept. */
  isExpired: (entry: T, now: number) => boolean;
}

/** Generic in-memory key-value store with periodic expired-entry sweeping and bounded size. */
export class InMemoryBucketStore<T> {
  private readonly buckets = new Map<string, T>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private readonly maxSize: number;
  private readonly sweepIntervalMs: number;
  private readonly isExpired: (entry: T, now: number) => boolean;

  constructor(options: InMemoryBucketStoreOptions<T>) {
    this.maxSize = options.maxSize ?? 100_000;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 5 * 60 * 1000;
    this.isExpired = options.isExpired;
  }

  /** Retrieves a bucket entry by key, or undefined if not present. */
  get(key: string): T | undefined {
    return this.buckets.get(key);
  }

  /** Stores or updates a bucket entry, evicting the oldest entry if at capacity. */
  set(key: string, value: T): void {
    if (!this.buckets.has(key) && this.buckets.size >= this.maxSize) {
      const oldest = this.buckets.keys().next().value;
      if (oldest) this.buckets.delete(oldest);
    }
    this.buckets.set(key, value);
    this.ensureSweep();
  }

  /** Removes a single bucket entry by key. */
  delete(key: string): void {
    this.buckets.delete(key);
  }

  /** Removes all entries and stops the sweep timer. */
  clear(): void {
    this.buckets.clear();
    this.stopSweep();
  }

  /** Returns the current number of entries in the store. */
  get size(): number {
    return this.buckets.size;
  }

  /** Stops the periodic sweep timer without clearing entries. */
  stopSweep(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private ensureSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.buckets) {
        if (this.isExpired(entry, now)) {
          this.buckets.delete(key);
        }
      }
      if (this.buckets.size === 0) {
        this.stopSweep();
      }
    }, this.sweepIntervalMs);
    if (typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
      this.sweepTimer.unref();
    }
  }
}
