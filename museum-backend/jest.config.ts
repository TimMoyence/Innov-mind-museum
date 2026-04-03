import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/dist/', '/node_modules/', '/tests/ai/'],
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
    'src/index\\.ts$',
    'src/instrumentation\\.ts$',
    'src/data/db/run-migrations\\.ts$',
    'src/data/db/migrations/',
  ],
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 71,
      functions: 79,
      lines: 85,
    },
  },
};
export default config;
