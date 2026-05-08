/**
 * Baseline tight configuration — banking-grade hot files only.
 * Mirrors stryker.config.mjs explicitly (no spread) — Stryker's option validator
 * mis-types unknown spread results, so we redeclare every field by hand.
 *
 * Scope : ~100 security-critical files (auth, security, audit, middleware, observability).
 *
 * Usage : `pnpm mutation:baseline` (script wraps `stryker run -c stryker.baseline.config.mjs`)
 *
 * The full report still accumulates in `reports/stryker-incremental.json` —
 * mutants outside this scope from prior runs are preserved by Stryker's
 * incremental diff.
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  reporters: ['html', 'json', 'clear-text', 'progress'],
  testRunner: 'jest',
  jest: {
    configFile: 'jest.config.ts',
    enableFindRelatedTests: false,
    config: {
      // forceExit MUST be false for Stryker hot-reload. Base jest.config.ts
      // has forceExit:true; explicit override here. See stryker.config.mjs
      // for the full rationale + the prometheus-metrics enableDefaultMetrics
      // refactor that unblocks hot-reload by removing the only module-load
      // timer that didn't .unref() in the audit/middleware/auth scopes.
      forceExit: false,
      projects: [
        {
          displayName: 'unit-integration',
          testEnvironment: 'node',
          transform: {
            '^.+\\.tsx?$': '@swc/jest',
          },
          moduleNameMapper: {
            '^@src/(.*)$': '<rootDir>/src/$1',
            '^@modules/(.*)$': '<rootDir>/src/modules/$1',
            '^@data/(.*)$': '<rootDir>/src/data/$1',
            '^@shared/(.*)$': '<rootDir>/src/shared/$1',
            '^tests/(.*)$': '<rootDir>/tests/$1',
          },
          testPathIgnorePatterns: [
            '/dist/',
            '/node_modules/',
            '/tests/ai/',
            '\\.stryker-run/',
            '<rootDir>/tests/e2e/',
            '<rootDir>/scripts/__tests__/',
            '<rootDir>/tests/integration/',
          ],
        },
      ],
    },
  },
  coverageAnalysis: 'perTest',
  ignoreStatic: true,
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  appendPlugins: ['@stryker-mutator/jest-runner'],
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
  thresholds: {
    high: 85,
    low: 70,
    break: 70,
  },
  // Aggressive timeout: 5s base + 0.5x baseline. With perTest coverage and
  // forceExit, legit mutants land in <1s. Most observed timeouts (100% rate
  // on the middleware/audit clusters) are infinite-loop mutants — burning
  // through them at 5s each is ~3x faster than 10s.
  timeoutMS: 5000,
  timeoutFactor: 0.5,
  // 8 workers (was 6) for the baseline run — more parallelism on the timeout
  // floor. Machine becomes less usable during this run; revert after.
  concurrency: process.env.CI === 'true' ? 4 : 8,
};
