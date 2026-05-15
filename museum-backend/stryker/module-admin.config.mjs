/**
 * module/admin scope — admin panel APIs (dashboards, audit, user listing).
 *
 * Mutates `src/modules/admin/**` (20 files: useCases, http routes, pg adapters).
 *
 * Usage: `pnpm stryker run stryker/module-admin.config.mjs`
 *
 * `setupFiles` pins `EXTRACTION_WORKER_ENABLED=false` for the sandbox. Every
 * admin route test goes through `createRouteTestApp()` → `createApp()` →
 * `mountDomainRouters()` which eagerly news up `BullmqMuseumEnrichmentQueueAdapter`
 * (ioredis TCP handle, never .unref'd). Under `forceExit:false` (Stryker's
 * mandatory mode) Jest waits on that handle forever → 100% mutant timeout
 * (run #2026-05-15 stalled at 172/207 timeouts, 0 killed). Pinning the flag
 * in the sandbox mirrors what e2e already does
 * (tests/helpers/e2e/jest-env.setup.ts) — admin tests don't exercise the
 * enrichment route, so the override changes no observable behavior.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/admin/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
  setupFiles: ['<rootDir>/tests/helpers/admin/jest-env.setup.ts'],
  // Sandbox dry-run exclusions — both files cover zero `src/modules/admin/**`
  // mutant so Stryker's perTest coverage analysis would never route an admin
  // mutant to them anyway, but they boot infra clients that leak open ioredis
  // TCP handles into the shared worker process and break the
  // `forceExit:false` cleanup between mutants.
  // - museum-enrichment.route.test.ts: asserts on the live enrichment route,
  //   404s under our EXTRACTION_WORKER_ENABLED=false pin.
  // - redis-cache-service.test.ts: line 240 directly instantiates
  //   `new RedisCacheService({ url: 'redis://localhost:6379' })` and never
  //   .quit()s — handle leaks regardless of any env flag.
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});
