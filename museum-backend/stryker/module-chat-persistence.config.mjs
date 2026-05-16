/**
 * module/chat carve-out — persistence (TypeORM chat / artKeyword / userMemory
 * repositories + query helpers).
 *
 * 8 files under `src/modules/chat/adapters/secondary/persistence/**`. Pattern
 * mirrors module-support: assert exact qb method args via spy-based mocks.
 *
 * Usage: `pnpm stryker run stryker/module-chat-persistence.config.mjs`
 *
 * `setupFiles` pins `EXTRACTION_WORKER_ENABLED=false` for the sandbox to
 * avoid the BullMQ/ioredis TCP handle leak that masks real kills as Timeout
 * under Stryker's mandatory `forceExit:false`. Mirrors module-admin
 * (see tests/helpers/chat/jest-env.setup.ts header for the full story).
 * `extraTestPathIgnorePatterns` matches the admin scope exclusion list —
 * both files cover zero persistence mutant (perTest coverage would skip
 * them anyway) but they boot infra clients that leak open ioredis TCP
 * handles into the shared worker process and break the `forceExit:false`
 * cleanup between mutants.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/adapters/secondary/persistence/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
  setupFiles: ['<rootDir>/tests/helpers/chat/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});
