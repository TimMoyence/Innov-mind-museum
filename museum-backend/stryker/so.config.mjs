/**
 * Security + Observability scope — ~7 files, ~200 mutants. Quick win.
 * Builds on top of audit + middleware caches.
 *
 * Usage : `pnpm stryker run stryker/so.config.mjs`
 *
 * Note : authored pre-STRYKER_CONCURRENCY knob; preserved via
 * `allowEnvConcurrency: false`.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/shared/security/**/*.ts',
    'src/shared/observability/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
  allowEnvConcurrency: false,
});
