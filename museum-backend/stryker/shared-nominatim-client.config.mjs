/**
 * shared/http carve-out — nominatim.client.ts only.
 *
 * Pulled out of `stryker/shared-http.config.mjs` (which now scopes the
 * overpass-cache/-tags/wikidata-ids trio at 100% covered) so the larger
 * 432-line Nominatim HTTP client can iterate independently without re-
 * mutating the small files every cycle.
 *
 * Usage: `pnpm stryker run stryker/shared-nominatim-client.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=4 …` (default 8 local / 4 CI).
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
  mutate: ['src/shared/http/nominatim.client.ts'],
  thresholds: { high: 85, low: 70, break: 70 },
  timeoutMS: 5000,
  timeoutFactor: 0.5,
  concurrency: process.env.STRYKER_CONCURRENCY
    ? Number(process.env.STRYKER_CONCURRENCY)
    : process.env.CI === 'true'
      ? 4
      : 8,
};
