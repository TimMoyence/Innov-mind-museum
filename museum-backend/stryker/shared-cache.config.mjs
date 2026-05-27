/**
 * shared/cache scope — noop-cache, redis-cache.
 * memory-cache.service.ts and resilient-cache.wrapper.ts carved out to
 * dedicated scopes (19 + 23 survivors on first run, would have polluted
 * baseline). See stryker/shared-memory-cache.config.mjs and
 * stryker/shared-resilient-cache.config.mjs.
 *
 * Usage : `pnpm stryker run stryker/shared-cache.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/shared/cache/**/*.ts',
    '!src/shared/cache/memory-cache.service.ts',
    '!src/shared/cache/resilient-cache.wrapper.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
