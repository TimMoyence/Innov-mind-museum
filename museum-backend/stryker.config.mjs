/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  reporters: ['html', 'json', 'clear-text', 'progress'],
  testRunner: 'jest',
  jest: {
    configFile: 'jest.config.ts',
    enableFindRelatedTests: false,
    // Inline forceExit redeclared in the merged `config:` block below — Stryker's
    // jest plugin overrides projects[] which can drop top-level options like
    // forceExit from jest.config.ts.
    // Stryker's jest runner does NOT support `--selectProjects`. The base
    // jest.config.ts declares 3 projects (unit-integration / e2e / scripts-esm).
    // Default `pnpm test` and `pnpm test:coverage` pin `--selectProjects
    // unit-integration`, so they never load the `scripts-esm` project (which
    // contains native ESM `.mjs` files that need NODE_OPTIONS=--experimental-vm
    // -modules). Stryker spawns jest *without* --selectProjects, so it
    // discovers all 3 projects and tries to parse `scripts/__tests__/*.test.mjs`
    // with the default node:vm Script loader, failing with:
    //   SyntaxError: Cannot use import statement outside a module
    //
    // Stryker's jest runner merges file-based config with this override via
    // `{...configFromFile, ...config, ...JEST_OVERRIDE_OPTIONS}`, so passing
    // `projects:` here cleanly replaces the file-based projects list. We keep
    // exactly the `unit-integration` project, which mirrors the path used by
    // the regular coverage gate. The `scripts-esm` project is irrelevant to
    // mutation testing — none of the `mutate:` files below are exercised by
    // those Node-script unit tests; and the `e2e` project requires
    // testcontainer infra (Postgres + Redis) which Stryker's per-mutant runs
    // would re-spin per worker (40+ minutes of overhead for zero coverage
    // signal on the hot files).
    config: {
      // forceExit MUST be false to enable Stryker's hot-reload (load tests
      // once, run with multiple mutants in-process). Base jest.config.ts has
      // forceExit:true (defensive default for `pnpm test`); we override here.
      // Pre-req: source modules in scope must not register module-load timers
      // that don't .unref() — see prometheus-metrics.ts enableDefaultMetrics()
      // refactor (lazy registration moved to app bootstrap).
      forceExit: false,
      projects: [
        {
          displayName: 'unit-integration',
          testEnvironment: 'node',
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
          testPathIgnorePatterns: [
            '/dist/',
            '/node_modules/',
            '/tests/ai/',
            '\\.stryker-run/',
            '<rootDir>/tests/e2e/',
            '<rootDir>/scripts/__tests__/',
            // Integration tests need live infra (Postgres testcontainer, Redis,
            // testcontainer S3) and a repo-root sentinel baseline that lives
            // OUTSIDE the museum-backend project. Stryker's sandbox isolates
            // museum-backend/, breaking the path traversal in
            // _smoke/integration-tier-baseline-cap.test.ts and incurring
            // testcontainer spin-up overhead per mutant that would inflate
            // mutation runs by 40+ minutes for zero coverage signal on the
            // banking-grade hot files (which are exercised by unit tests).
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
  // pnpm strict hoisting: jest-runner must be explicitly listed
  appendPlugins: ['@stryker-mutator/jest-runner'],
  mutate: [
    // Full BE coverage (2026-05-08): the prior explicit phase-by-phase list
    // (~50 files) was a curated banking-grade subset. Expanding to every
    // source file under src/** trades runtime for completeness — incremental
    // mode + a versioned `reports/stryker-incremental.json` keeps the cost
    // low after the first full run.
    'src/**/*.ts',
    // Exclusions — generated, declarative, or low-signal targets where every
    // mutant survives by construction (entity decorators, migration SQL
    // strings, type-only re-exports, env parsing).
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
  thresholds: {
    high: 85,
    low: 70,
    break: 70,
  },
  // Dry-run baseline = 14ms/test moyen. timeoutFactor (1.5) × baseline + timeoutMS
  // gives the effective per-mutant timeout. 30s was massively over-provisioned —
  // 1693 timeouts at 4% wasted ~14h on hangs. 10s leaves comfortable margin for
  // the rare IO test while freeing workers ~3× faster on infinite-loop mutants.
  timeoutMS: 10000,
  // CI ubuntu-latest = 4 vCPUs (cap 4). Local M1 Pro = 8-10 cores, 16GB RAM,
  // can sustain 6 concurrent Jest workers (~500MB each, 3GB total — well
  // under RAM budget). 6 (not 8) keeps 2 cores free for IDE / browser /
  // Claude during overnight runs so the machine stays usable.
  concurrency: process.env.CI === 'true' ? 4 : 6,
};
