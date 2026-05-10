/**
 * shared/validation/zod-issue.formatter scope — DEDICATED follow-up scope.
 *
 * 1 file (~34 lignes), 24 mutants. Initial run on 2026-05-10 produced 8 survivors
 * at 63.64% covered — formatZodIssue / formatZodIssues lack dedicated tests
 * (they are exercised transitively via validateBody middleware tests). Carved
 * out of stryker.shared-validation so that baseline could land at 100%.
 *
 * Strategy when this scope is run: create
 * `tests/unit/shared/validation/zod-issue-formatter.test.ts` with cases for:
 *   - undefined issue -> 'Invalid payload'
 *   - empty path -> raw message
 *   - message already prefixed with `<path> ` or `<path>.` -> raw
 *   - otherwise `<path> <message>`
 *   - empty issues array -> 'Invalid payload'
 *   - non-empty issues -> joined with ', '
 *
 * Usage : `pnpm stryker run stryker/shared-zod-issue.config.mjs`
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
  mutate: ['src/shared/validation/zod-issue.formatter.ts'],
  thresholds: { high: 85, low: 70, break: 70 },
  timeoutMS: 5000,
  timeoutFactor: 0.5,
  concurrency: process.env.STRYKER_CONCURRENCY
    ? Number(process.env.STRYKER_CONCURRENCY)
    : process.env.CI === 'true'
      ? 4
      : 8,
};
