import type { Config } from '@jest/types';

process.env.TZ = 'UTC';

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
  testEnvironment: 'node' as const,
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
  coveragePathIgnorePatterns: sharedCoveragePathIgnorePatterns,
};

const baseTestPathIgnorePatterns = [
  '/dist/',
  '/node_modules/',
  '/tests/ai/',
  '\\.stryker-tmp/',
  '\\.stryker-run/',
];

const RECALL_TEST = '<rootDir>/tests/integration/chat/visual-similarity/recall.test.ts';

const config: Config.InitialOptions = {
  forceExit: true,
  workerIdleMemoryLimit: '1GB',

  globalTeardown: '<rootDir>/tests/helpers/e2e/jest-global-teardown.cjs',

  collectCoverage: true,
  coverageReporters: ['text-summary', 'lcov'],
  coveragePathIgnorePatterns: sharedCoveragePathIgnorePatterns,
  coverageThreshold:
    process.env.SHARDED_COVERAGE === '1'
      ? undefined
      : {
          global: {
            statements: 88,
            branches: 74,
            functions: 86,
            lines: 89,
          },
        },

  projects: [
    {
      ...sharedProjectOptions,
      displayName: 'unit-integration',
      testPathIgnorePatterns: [
        ...baseTestPathIgnorePatterns,
        '<rootDir>/tests/e2e/',
        '<rootDir>/scripts/__tests__/',
        RECALL_TEST,
      ],
      setupFiles: [
        '<rootDir>/tests/helpers/jest-env-pgdatabase.setup.ts',
        '<rootDir>/tests/helpers/loopback-servers.setup.ts',
      ],
    },
    {
      ...sharedProjectOptions,
      displayName: 'onnx-recall',
      testEnvironment: '<rootDir>/tests/helpers/integration/onnx-node-environment.cjs',
      testMatch: [RECALL_TEST],
      testPathIgnorePatterns: baseTestPathIgnorePatterns,
      setupFiles: [
        '<rootDir>/tests/helpers/jest-env-pgdatabase.setup.ts',
        '<rootDir>/tests/helpers/loopback-servers.setup.ts',
      ],
    },
    {
      ...sharedProjectOptions,
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      testPathIgnorePatterns: baseTestPathIgnorePatterns,
      setupFiles: [
        '<rootDir>/tests/helpers/e2e/jest-env.setup.ts',
        '<rootDir>/tests/helpers/loopback-servers.setup.ts',
      ],
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
