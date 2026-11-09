import { createApp } from '@src/app';
import {
  clearRateLimitBuckets,
  stopRateLimitSweep,
} from '@shared/middleware/rate-limit.middleware';

export function createRouteTestApp() {
  const app = createApp({
    healthCheck: async () => ({ database: 'up' }),
  });

  return { app };
}

export function resetRateLimits() {
  clearRateLimitBuckets();
}

export { stopRateLimitSweep };
