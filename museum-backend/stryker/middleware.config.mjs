/**
 * MIDDLEWARE-only baseline config — fast iteration, ~10 files.
 * Validates rate-limit + daily-chat-limit + auth middleware mutation kills.
 *
 * Usage : `pnpm stryker run stryker/middleware.config.mjs`
 *
 * Note : authored pre-STRYKER_CONCURRENCY knob; preserved via
 * `allowEnvConcurrency: false`.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/helpers/middleware/**/*.ts', '!src/**/*.types.ts'],
  allowEnvConcurrency: false,
});
