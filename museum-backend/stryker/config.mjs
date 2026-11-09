const SHARED_JEST_PROJECTS = [
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
];

const DEFAULT_THRESHOLDS = { high: 85, low: 70, break: 70 };

const DEFAULT_CONCURRENCY_LOCAL_TIGHT = 8;
const DEFAULT_CONCURRENCY_LOCAL_FULL = 6;
const CI_CONCURRENCY = 4;

function resolveConcurrency({ localDefault, allowEnvOverride }) {
  if (allowEnvOverride && process.env.STRYKER_CONCURRENCY) {
    return Number(process.env.STRYKER_CONCURRENCY);
  }
  return process.env.CI === 'true' ? CI_CONCURRENCY : localDefault;
}

export function defineConfig(opts) {
  const {
    mutate,
    thresholds = DEFAULT_THRESHOLDS,
    timeoutMS = 5000,
    timeoutFactor = 0.5,
    allowEnvConcurrency = true,
    localConcurrency = DEFAULT_CONCURRENCY_LOCAL_TIGHT,
    dryRunTimeoutMinutes,
    setupFiles,
    extraTestPathIgnorePatterns,
  } = opts;

  const needsProjectsClone =
    (setupFiles && setupFiles.length > 0) ||
    (extraTestPathIgnorePatterns && extraTestPathIgnorePatterns.length > 0);
  const projects = needsProjectsClone
    ? SHARED_JEST_PROJECTS.map((project) => ({
        ...project,
        ...(setupFiles && setupFiles.length > 0 ? { setupFiles } : {}),
        ...(extraTestPathIgnorePatterns && extraTestPathIgnorePatterns.length > 0
          ? {
              testPathIgnorePatterns: [
                ...project.testPathIgnorePatterns,
                ...extraTestPathIgnorePatterns,
              ],
            }
          : {}),
      }))
    : SHARED_JEST_PROJECTS;

  const config = {
    packageManager: 'pnpm',
    reporters: ['html', 'json', 'clear-text', 'progress'],
    testRunner: 'jest',
    jest: {
      configFile: 'jest.config.ts',
      enableFindRelatedTests: false,
      config: {
        forceExit: false,
        projects,
      },
    },
    coverageAnalysis: 'perTest',
    ignoreStatic: true,
    incremental: true,
    incrementalFile: 'reports/stryker-incremental.json',
    appendPlugins: ['@stryker-mutator/jest-runner'],
    mutate,
    thresholds,
    timeoutMS,
    timeoutFactor,
    concurrency: resolveConcurrency({
      localDefault: localConcurrency,
      allowEnvOverride: allowEnvConcurrency,
    }),
  };

  if (dryRunTimeoutMinutes !== undefined) {
    config.dryRunTimeoutMinutes = dryRunTimeoutMinutes;
  }

  return config;
}

export default defineConfig({
  mutate: [
    'src/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.migration.ts',
    '!src/**/*.d.ts',
    '!src/**/*.types.ts',
    '!src/data/db/migrations/**',
    '!src/data/db/data-source.ts',
    '!src/index.ts',
    '!src/app.ts',
    '!src/config/env.ts',
  ],
  timeoutMS: 10000,
  timeoutFactor: 1.5,
  allowEnvConcurrency: false,
  localConcurrency: DEFAULT_CONCURRENCY_LOCAL_FULL,
});
