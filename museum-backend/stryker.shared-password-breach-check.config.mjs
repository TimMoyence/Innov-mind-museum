/**
 * shared/validation/password-breach-check scope — DEDICATED follow-up scope.
 *
 * 1 file (149 lignes), 79 mutants, HIBP k-anonymity client + assertPasswordNotBreached.
 * Initial run on 2026-05-10 produced 14 survivors at 81.82% covered — carved out
 * of stryker.shared-validation so that baseline could land at 100%.
 *
 * Survivor categories observed:
 *   - StringLiteral mutants on log event names ('hibp_unexpected_status', 'hibp_unavailable_failopen')
 *   - ObjectLiteral mutants on logger.warn / captureExceptionWithContext payloads
 *   - LogicalOperator mutant on `options.timeoutMs ?? DEFAULT_TIMEOUT_MS`
 *   - ConditionalExpression on `if (result.breached) throw AppError`
 *
 * Strategy when this scope is run: extend tests/unit/auth/password-breach-check.test.ts
 * with assertions on logger.warn calls (event name + meta), captureExceptionWithContext
 * payload contracts, and explicit timeoutMs override path.
 *
 * Usage : `pnpm stryker run stryker.shared-password-breach-check.config.mjs`
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
  mutate: ['src/shared/validation/password-breach-check.ts'],
  thresholds: { high: 85, low: 70, break: 70 },
  timeoutMS: 5000,
  timeoutFactor: 0.5,
  concurrency: process.env.STRYKER_CONCURRENCY
    ? Number(process.env.STRYKER_CONCURRENCY)
    : process.env.CI === 'true'
      ? 4
      : 8,
};
