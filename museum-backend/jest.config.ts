import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/dist/', '/node_modules/', '/tests/ai/', '\\.stryker-tmp/', '\\.stryker-run/'],
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
    'src/modules/auth/core/useCase/index\\.ts$',
    'src/modules/support/useCase/index\\.ts$',
    'src/shared/audit/index\\.ts$',
    'src/shared/cache/noop-cache\\.service\\.ts$',
  ],
  coverageThreshold: {
    global: {
      statements: 92,
      branches: 84,
      functions: 91,
      lines: 92,
    },
  },
};
export default config;
