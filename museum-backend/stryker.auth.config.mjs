/**
 * Auth scope — `src/modules/auth/**`. Largest banking-grade scope.
 * ~30+ files, ~1500+ mutants. ETA 1.5-2h on M1 Pro with hot-reload.
 *
 * Builds on audit + middleware + security+observability caches.
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
  mutate: [
    'src/modules/auth/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
    '!src/**/*.migration.ts',
  ],
  thresholds: { high: 85, low: 70, break: 70 },
  timeoutMS: 5000,
  timeoutFactor: 0.5,
  concurrency: process.env.CI === 'true' ? 4 : 8,
};
