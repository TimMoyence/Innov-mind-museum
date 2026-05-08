/**
 * AUDIT-only baseline config — fallback when full baseline is too slow.
 * 10 files, ~300-400 mutants. Should complete in ~20-30 min on M1 Pro.
 *
 * Usage : `pnpm stryker run stryker.audit.config.mjs`
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
      // forceExit:false → enables Stryker hot-reload (~10x throughput vs
      // spawn-per-mutant). Pre-req: no unref'd module-load timers in scope
      // (verified: prometheus-metrics now lazy via enableDefaultMetrics).
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
    'src/shared/audit/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
  thresholds: { high: 85, low: 70, break: 70 },
  timeoutMS: 5000,
  timeoutFactor: 0.5,
  concurrency: process.env.CI === 'true' ? 4 : 8,
};
