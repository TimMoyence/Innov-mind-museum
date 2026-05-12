/**
 * AUDIT-only baseline config — fallback when full baseline is too slow.
 * 10 files, ~300-400 mutants. Should complete in ~20-30 min on M1 Pro.
 *
 * Usage : `pnpm stryker run stryker/audit.config.mjs`
 *
 * Note : authored pre-STRYKER_CONCURRENCY knob; preserved via
 * `allowEnvConcurrency: false`.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/audit/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
  allowEnvConcurrency: false,
});
