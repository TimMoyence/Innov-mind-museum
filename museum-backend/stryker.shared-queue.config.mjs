/**
 * shared/queue scope — scheduled-jobs only (job-failure.handler.ts has no direct
 * test → moved to no-test backlog, excluded from this scope to avoid drowning
 * the score with NoCoverage mutants).
 *
 * Usage : `pnpm stryker run stryker.shared-queue.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 pnpm stryker run …` (default 8 local / 4 CI).
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
    'src/shared/queue/scheduled-jobs.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
  thresholds: { high: 85, low: 70, break: 70 },
  timeoutMS: 5000,
  timeoutFactor: 0.5,
  concurrency: process.env.STRYKER_CONCURRENCY
    ? Number(process.env.STRYKER_CONCURRENCY)
    : process.env.CI === 'true'
      ? 4
      : 8,
};
