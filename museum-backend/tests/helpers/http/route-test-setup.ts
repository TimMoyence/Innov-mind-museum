import { createApp } from '@src/app';
import {
  clearRateLimitBuckets,
  stopRateLimitSweep,
} from '@src/helpers/middleware/rate-limit.middleware';

/**
 * Creates a test Express app with mocked healthCheck and provides
 * rate-limit cleanup helpers for beforeEach/afterAll.
 * @returns An object containing the Express app instance.
 */
export function createRouteTestApp() {
  const app = createApp({
    healthCheck: async () => ({ database: 'up' }),
  });

  return { app };
}

/** Call in beforeEach to reset rate limit state between tests. */
export function resetRateLimits() {
  clearRateLimitBuckets();
}

/** Call in afterAll to stop the background sweep interval. */
export { stopRateLimitSweep };
