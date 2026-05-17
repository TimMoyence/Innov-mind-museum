/**
 * module/museum scope — museum catalog + tour points-of-interest.
 *
 * Mutates `src/modules/museum/**` (28 files: useCases, http routes, pg adapters,
 * tour generation).
 *
 * Usage: `pnpm stryker run stryker/module-museum.config.mjs`
 *
 * `setupFiles` pins `EXTRACTION_WORKER_ENABLED=false` for the sandbox to
 * avoid the BullMQ/ioredis TCP handle leak that masks real kills as Timeout
 * under Stryker's mandatory `forceExit:false`. Mirrors module-admin
 * (see tests/helpers/museum/jest-env.setup.ts header for the full story).
 * `extraTestPathIgnorePatterns` matches the admin scope exclusion list —
 * both files boot infra clients that leak open ioredis TCP handles into
 * the shared worker process and break the `forceExit:false` cleanup
 * between mutants. The `museum-enrichment.route.test.ts` exclusion is
 * particularly important here because the enrichment route is part of
 * the museum module: under the pin it 404s, so excluding it from the
 * sandbox dry-run prevents a false negative without affecting mutant
 * coverage (the route mount lives in `src/app.ts`, outside the museum
 * mutate scope).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/museum/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
  setupFiles: ['<rootDir>/tests/helpers/museum/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
  // 5302-test dry-run exceeds Stryker's 5min default on contended runners
  // (audit-360 S3 Phase 4 timed out 4x: 5min default + 15min retry under
  // STRYKER_CONCURRENCY=1). Bump to 15min for headroom — pure timeout knob,
  // does not change mutation logic or sandboxing.
  dryRunTimeoutMinutes: 15,
});
