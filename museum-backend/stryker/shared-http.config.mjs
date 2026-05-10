/**
 * shared/http scope — small + well-tested files only.
 *
 * Mutate: overpass-cache.ts + overpass-tags.ts + wikidata-ids.ts (3 files,
 * each with a dedicated test).
 *
 * Carved out (deferred to dedicated scopes — high mutant density without
 * matching test surface or large fault-injection scope):
 *   - nominatim.client.ts  (stryker/shared-nominatim-client.config.mjs)
 *   - overpass.client.ts   (stryker/shared-overpass-client.config.mjs)
 *   - overpass-constants.ts, overpass-queries.ts, overpass-transport.ts,
 *     overpass-types.ts, requireUser.ts — bundled into
 *     stryker/shared-http-no-test.config.mjs
 *
 * Background: a single shared-http run with all 10 files instrumented 547
 * mutants and was killed at ~50 min after exhausting test-runner memory and
 * still showing ~290 untested mutants. Splitting into well-bounded scopes
 * keeps Stryker progress reliable and the cache-write lifecycle short.
 *
 * Usage : `pnpm stryker run stryker/shared-http.config.mjs`
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
  mutate: [
    'src/shared/http/overpass-cache.ts',
    'src/shared/http/overpass-tags.ts',
    'src/shared/http/wikidata-ids.ts',
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
