/**
 * Baseline tight configuration — banking-grade hot files only.
 *
 * Scope : ~100 security-critical files (auth, security, audit, middleware,
 * observability).
 *
 * Usage : `pnpm mutation:baseline` (script wraps `stryker run -c stryker/baseline.config.mjs`)
 *
 * The full report still accumulates in `reports/stryker-incremental.json` —
 * mutants outside this scope from prior runs are preserved by Stryker's
 * incremental diff.
 *
 * Note on timeouts : aggressive 5s base + 0.5x baseline. With perTest coverage
 * and forceExit:false, legit mutants land in <1s. Most observed timeouts
 * (100% rate on the middleware/audit clusters) are infinite-loop mutants —
 * burning through them at 5s each is ~3x faster than 10s.
 *
 * Note on concurrency : authored pre-STRYKER_CONCURRENCY knob; preserved
 * via `allowEnvConcurrency: false` to keep the original `CI ? 4 : 8` shape.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/auth/**/*.ts',
    'src/shared/security/**/*.ts',
    'src/shared/audit/**/*.ts',
    'src/helpers/middleware/**/*.ts',
    'src/shared/observability/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.migration.ts',
    '!src/**/*.d.ts',
    '!src/**/*.types.ts',
    '!src/data/db/migrations/**',
  ],
  allowEnvConcurrency: false,
});
