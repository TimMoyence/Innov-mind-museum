import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Force-exit after the test run completes so dangling ioredis / BullMQ
  // reconnect timers (when Redis is not available locally) do not hang Jest.
  // Tests are responsible for stopping their own resources; this is a safety
  // net for integration tests that touch transitively-loaded modules holding
  // background sockets (rate-limit sweep, museum-enrichment cache adapter).
  forceExit: true,
  // Pins env vars (EXTRACTION_WORKER_ENABLED=false, CACHE_ENABLED=false) BEFORE
  // any test file's top-level imports trigger `@src/config/env` evaluation.
  // Without this, transitive imports (e.g. `@shared/logger` -> `env.ts`) would
  // capture default `extractionWorkerEnabled=true` and the e2e harness override
  // applied later inside `createE2EHarness()` would arrive too late, leaving a
  // BullMQ/ioredis ECONNREFUSED log flood throughout the e2e suites.
  setupFiles: ['<rootDir>/tests/helpers/e2e/jest-env.setup.ts'],
  testPathIgnorePatterns: [
    '/dist/',
    '/node_modules/',
    '/tests/ai/',
    '\\.stryker-tmp/',
    '\\.stryker-run/',
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@data/(.*)$': '<rootDir>/src/data/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^tests/(.*)$': '<rootDir>/tests/$1',
  },
  collectCoverage: true,
  coverageReporters: ['text-summary', 'lcov'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/',
    '\\.stryker-tmp/',
    'src/index\\.ts$',
    'src/instrumentation\\.ts$',
    'src/data/db/run-migrations\\.ts$',
    'src/data/db/migrations/',
    'src/data/db/data-source\\.ts$',
    'src/modules/chat/index\\.ts$',
    'src/modules/auth/useCase/index\\.ts$',
    'src/modules/support/useCase/index\\.ts$',
    'src/shared/audit/index\\.ts$',
    'src/shared/cache/noop-cache\\.service\\.ts$',
  ],
  coverageThreshold: {
    global: {
      statements: 88,
      branches: 77,
      functions: 85,
      lines: 88,
    },
  },
};
export default config;
