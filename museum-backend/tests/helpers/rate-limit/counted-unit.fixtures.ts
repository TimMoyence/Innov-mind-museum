import type { CountedUnit } from '@shared/middleware/redis-rate-limit-store';

export const makeCountedUnit = (count: number, resetAt: number): CountedUnit => ({
  count,
  resetAt,
  release: () => Promise.resolve(),
});
