/**
 * shared/cache/memory-cache.service scope — DEDICATED follow-up scope.
 *
 * 1 file, 99 mutants. Initial run on 2026-05-10 produced 19 survivors at
 * 76.54% covered + 16 NoCoverage entries. Carved out of stryker.shared-cache
 * so that baseline could land at 100%.
 *
 * Strategy when this scope is run: extend memory-cache tests with assertions
 * around Date.now() boundary (TTL expiry), eviction order, and zset-based
 * expirations.
 *
 * Usage : `pnpm stryker run stryker/shared-memory-cache.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/cache/memory-cache.service.ts'],
  thresholds: { high: 85, low: 60, break: 60 },
});
