/**
 * Auth scope — `src/modules/auth/**`. Largest banking-grade scope.
 * ~30+ files, ~1500+ mutants. ETA 1.5-2h on M1 Pro with hot-reload.
 *
 * Builds on audit + middleware + security+observability caches.
 *
 * Usage : `pnpm stryker run stryker/auth.config.mjs`
 *
 * Note : authored pre-STRYKER_CONCURRENCY knob; preserved via
 * `allowEnvConcurrency: false`.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/auth/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
    '!src/**/*.migration.ts',
  ],
  allowEnvConcurrency: false,
});
