import type { Config } from '@jest/types';

/**
 * Shared per-project options. `preset`, `transform`, `moduleNameMapper`,
 * `testEnvironment`, and `testPathIgnorePatterns` are project-scoped in Jest
 * 29 and must be repeated on each entry of `projects`.
 */
const sharedCoveragePathIgnorePatterns = [
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
];

const sharedProjectOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node' as const,
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
  coveragePathIgnorePatterns: sharedCoveragePathIgnorePatterns,
};

const baseTestPathIgnorePatterns = [
  '/dist/',
  '/node_modules/',
  '/tests/ai/',
  '\\.stryker-tmp/',
  '\\.stryker-run/',
];

const config: Config.InitialOptions = {
  // Force-exit after the test run completes so dangling ioredis / BullMQ
  // reconnect timers (when Redis is not available locally) do not hang Jest.
  // Tests are responsible for stopping their own resources; this is a safety
  // net for integration tests that touch transitively-loaded modules holding
  // background sockets (rate-limit sweep, museum-enrichment cache adapter).
  forceExit: true,

  // Coverage reporters are global; coveragePathIgnorePatterns is project-scoped
  // in Jest 29 with `projects`, so the patterns are wired into
  // `sharedProjectOptions` above and re-applied per project.
  collectCoverage: true,
  coverageReporters: ['text-summary', 'lcov'],
  coveragePathIgnorePatterns: sharedCoveragePathIgnorePatterns,
  coverageThreshold: {
    global: {
      // Phase 9 close: thresholds match Phase 9 Sprint 9.4 default actuals
      // (statements 90.27%, branches 79.31%, functions 85.80%, lines 90.69%
      // without RUN_INTEGRATION; rises to 91.41/81.04/87.45/91.84 with).
      // Branches deliberately stays at 78 — Phase 0 challenger pushback +
      // ADR-007: the Phase 4 Stryker mutation kill ratio (≥80% on hot files)
      // is the banking-grade signal; pushing branches further forces
      // cosmetic test patterns.
      statements: 90,
      branches: 78,
      functions: 85,
      lines: 90,
    },
  },

  // Two projects:
  // - `unit-integration`: everything except tests/e2e/. NO global env pinning,
  //   so unit/integration tests that rely on default `extractionWorkerEnabled`
  //   (e.g. museum-enrichment route mounting) keep working.
  // - `e2e`: only tests under tests/e2e/. Pins EXTRACTION_WORKER_ENABLED=false
  //   and CACHE_ENABLED=false BEFORE any test file's top-level imports trigger
  //   `@src/config/env` evaluation, preventing BullMQ/ioredis ECONNREFUSED log
  //   floods when the e2e harness applies the same overrides too late.
  // - `scripts-esm`: native ESM .mjs test files for standalone Node scripts
  //   (e.g. stryker-hot-files-gate). Requires NODE_OPTIONS=--experimental-vm-modules.
  projects: [
    {
      ...sharedProjectOptions,
      displayName: 'unit-integration',
      testPathIgnorePatterns: [
        ...baseTestPathIgnorePatterns,
        '<rootDir>/tests/e2e/',
        '<rootDir>/scripts/__tests__/',
      ],
    },
    {
      ...sharedProjectOptions,
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      testPathIgnorePatterns: baseTestPathIgnorePatterns,
      setupFiles: ['<rootDir>/tests/helpers/e2e/jest-env.setup.ts'],
    },
    {
      displayName: 'scripts-esm',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/scripts/__tests__/**/*.test.mjs'],
      transform: {},
    },
  ],
};
export default config;
