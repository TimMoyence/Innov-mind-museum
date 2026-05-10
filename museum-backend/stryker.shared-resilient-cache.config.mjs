/**
 * shared/cache/resilient-cache.wrapper scope — DEDICATED follow-up scope.
 *
 * 1 file, 48 mutants. Initial run on 2026-05-10 produced 23 survivors at
 * 47.73% covered. Wrapper logic (circuit-breaker / fallback) needs more
 * fault-injection tests (timeouts, network errors, breaker-open transitions).
 * Carved out of stryker.shared-cache so that baseline could land at 100%.
 *
 * Strategy when this scope is run: extend resilient-cache-wrapper.test.ts
 * with breaker state transition cases and explicit assertions on logger
 * payloads / sentry tags fired on each fallback path.
 *
 * Usage : `pnpm stryker run stryker.shared-resilient-cache.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
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
      forceExit: false,
      projects: [
        {
          displayName: 'unit-integration',
          testEnvironment: 'node',
          transform: { '^.+\\.tsx?$': '@swc/jest' },
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
  mutate: ['src/shared/cache/resilient-cache.wrapper.ts'],
  thresholds: { high: 85, low: 50, break: 50 },
  timeoutMS: 5000,
  timeoutFactor: 0.5,
  concurrency: process.env.STRYKER_CONCURRENCY
    ? Number(process.env.STRYKER_CONCURRENCY)
    : process.env.CI === 'true'
      ? 4
      : 8,
};
