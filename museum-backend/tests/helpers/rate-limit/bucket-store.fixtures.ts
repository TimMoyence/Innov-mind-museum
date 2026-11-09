import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

export interface TestBucket {
  value: number;
  expiresAt: number;
}

interface MakeBucketStoreOptions {
  maxSize?: number;
  sweepIntervalMs?: number;
  isExpired?: (entry: TestBucket, now: number) => boolean;
}

export const makeBucketStore = (
  options: MakeBucketStoreOptions = {},
): InMemoryBucketStore<TestBucket> =>
  new InMemoryBucketStore<TestBucket>({
    maxSize: options.maxSize,
    sweepIntervalMs: options.sweepIntervalMs,
    isExpired: options.isExpired ?? ((entry: TestBucket, now: number) => entry.expiresAt <= now),
  });

export const makeBucket = (overrides: Partial<TestBucket> = {}): TestBucket => ({
  value: 1,
  expiresAt: Date.now() + 10_000,
  ...overrides,
});
