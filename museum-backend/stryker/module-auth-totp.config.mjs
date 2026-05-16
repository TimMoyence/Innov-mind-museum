/**
 * module/auth/totp scope — TOTP MFA use cases + helpers.
 *
 * Bootstraps the first module-level scope of the Stryker cache. Covers
 * the R16 TOTP enrollment + verification + recovery suite that backs the
 * MFA endpoints in `museum-backend/src/modules/auth/adapters/primary/http/routes/mfa.route.ts`.
 *
 * Usage: `pnpm stryker run stryker/module-auth-totp.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=4 …` (default 8 local / 4 CI).
 *
 * `setupFiles` pins `EXTRACTION_WORKER_ENABLED=false` for the sandbox to
 * avoid the BullMQ/ioredis TCP handle leak that masks real kills as Timeout
 * under Stryker's mandatory `forceExit:false`. Mirrors module-admin
 * (see tests/helpers/auth/jest-env.setup.ts header for the full story).
 * `extraTestPathIgnorePatterns` matches the admin scope exclusion list —
 * both files cover zero `src/modules/auth/useCase/totp/**` mutant (perTest
 * coverage would skip them anyway) but they boot infra clients that leak
 * open ioredis TCP handles into the shared worker process and break the
 * `forceExit:false` cleanup between mutants.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/auth/useCase/totp/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
  setupFiles: ['<rootDir>/tests/helpers/auth/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});
