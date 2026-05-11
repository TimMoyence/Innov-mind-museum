import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

/**
 * Test bucket shape used by InMemoryBucketStore unit tests. Mirrors the
 * shape of real rate-limit buckets (login limiter, request limiter) without
 * importing module-specific types — keeps the generic store tests decoupled.
 */
export interface TestBucket {
  value: number;
  expiresAt: number;
}

interface MakeBucketStoreOptions {
  maxSize?: number;
  sweepIntervalMs?: number;
  /** Override the expiry predicate. Default: `entry.expiresAt <= now`. */
  isExpired?: (entry: TestBucket, now: number) => boolean;
}

/**
 * Shared factory for {@link InMemoryBucketStore} instances under test.
 *
 * Passes overrides through verbatim (including `undefined`) so the
 * constructor's own `?? 5 * 60 * 1000` fallback is exercised by tests that
 * deliberately omit `sweepIntervalMs`. Defaults to a no-options call when
 * the caller passes nothing — matches the production usage where rate
 * limiters rely on the constructor's defaults.
 */
export const makeBucketStore = (
  options: MakeBucketStoreOptions = {},
): InMemoryBucketStore<TestBucket> =>
  new InMemoryBucketStore<TestBucket>({
    maxSize: options.maxSize,
    sweepIntervalMs: options.sweepIntervalMs,
    isExpired: options.isExpired ?? ((entry: TestBucket, now: number) => entry.expiresAt <= now),
  });

/**
 * Builds a TestBucket entry. `expiresAt` defaults to "10s from now" so
 * that a fresh entry is never expired under default sweep intervals.
 */
export const makeBucket = (overrides: Partial<TestBucket> = {}): TestBucket => ({
  value: 1,
  expiresAt: Date.now() + 10_000,
  ...overrides,
});
