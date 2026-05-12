/**
 * shared/cache/resilient-cache.wrapper scope — DEDICATED follow-up scope.
 *
 * 1 file, 48 mutants. Initial run on 2026-05-10 produced 23 survivors at
 * 47.73% covered. Wrapper logic (circuit-breaker / fallback) needs more
 * fault-injection tests (timeouts, network errors, breaker-open transitions).
 * Carved out of stryker.shared-cache so that baseline could land at 100%.
 *
 * Strategy when this scope is run: extend resilient-cache-wrapper.test.ts
 * with breaker state transition cases and explicit assertions on logger
 * payloads / sentry tags fired on each fallback path.
 *
 * Usage : `pnpm stryker run stryker/shared-resilient-cache.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/cache/resilient-cache.wrapper.ts'],
  thresholds: { high: 85, low: 50, break: 50 },
});
