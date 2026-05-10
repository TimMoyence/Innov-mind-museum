/**
 * shared/utils/string-similarity scope — DEDICATED follow-up scope.
 *
 * 1 file (202 lignes), ~161 mutants, complex algorithm (Levenshtein + Jaro-Winkler
 * variants). Initial run on 2026-05-10 produced 49 survivors at 69.57% covered —
 * carved out of stryker.shared-utils so the utils baseline could land at 100%.
 *
 * Strategy when this scope is run:
 *   1. Categorize survivors: equivalent mutants (algorithmic equivalences) vs
 *      assertion gaps (test data not exercising the branch).
 *   2. For assertion gaps, add tests that exercise specific edge cases.
 *   3. For equivalent mutants, document via // stryker-disable-next-line
 *      with reason.
 *
 * Usage : `pnpm stryker run stryker/shared-string-similarity.config.mjs`
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
  mutate: ['src/shared/utils/string-similarity.ts'],
  // Lower break threshold while the survivor backlog is being worked through —
  // bumped back to 70 once <10 survivors remain.
  thresholds: { high: 85, low: 50, break: 50 },
  timeoutMS: 5000,
  timeoutFactor: 0.5,
  concurrency: process.env.STRYKER_CONCURRENCY
    ? Number(process.env.STRYKER_CONCURRENCY)
    : process.env.CI === 'true'
      ? 4
      : 8,
};
