/**
 * module/auth/mfa-route scope — MFA HTTP route (carve-out from `auth`).
 *
 * Targets `src/modules/auth/adapters/primary/http/routes/mfa.route.ts` (61 NC
 * mutants pre-carve). Carve-out per night-recap sentinel rule: a single
 * route file dominating the survivor count justifies its own config so the
 * parent `auth` scope cache stays clean and iteration on mfa.route is fast.
 *
 * Usage: `pnpm stryker run stryker/module-auth-mfa-route.config.mjs`
 *
 * `setupFiles` pins `EXTRACTION_WORKER_ENABLED=false` for the sandbox to
 * avoid the BullMQ/ioredis TCP handle leak that masks real kills as Timeout
 * under Stryker's mandatory `forceExit:false`. Mirrors module-admin
 * (see tests/helpers/auth/jest-env.setup.ts header for the full story).
 * `extraTestPathIgnorePatterns` matches the admin scope exclusion list —
 * both files cover zero `src/modules/auth/**` mutant (perTest coverage
 * would skip them anyway) but they boot infra clients that leak open
 * ioredis TCP handles into the shared worker process and break the
 * `forceExit:false` cleanup between mutants.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/auth/adapters/primary/http/routes/mfa.route.ts'],
  setupFiles: ['<rootDir>/tests/helpers/auth/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});
