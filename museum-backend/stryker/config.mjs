/**
 * Stryker base config + factory.
 *
 * This file plays two roles:
 *   1. Default export = the "all of src/**" full-scope config used when
 *      Stryker auto-discovers a config (P2-4 leaves discovery untouched; the
 *      consuming scripts in package.json point at named files explicitly).
 *   2. `defineConfig()` named export = factory used by every per-scope
 *      wrapper file in this directory to avoid re-declaring the (large)
 *      shared options block.
 *
 * Why a factory and not a spread :
 *   Stryker's option validator type-checks the spread result against
 *   `PartialStrykerOptions` and historically mis-typed nested spreads of
 *   the `jest.config.projects[]` block (it stripped `displayName` and
 *   triggered "Unknown stryker config option" warnings on every wrapper).
 *   Returning a freshly-constructed object from the factory side-steps that.
 *
 * ─── Jest projects[] override (CRITICAL) ────────────────────────────────
 * Stryker's jest runner does NOT support `--selectProjects`. The base
 * jest.config.ts declares 3 projects (unit-integration / e2e / scripts-esm).
 * `pnpm test` pins `--selectProjects unit-integration`; Stryker spawns jest
 * without that flag and discovers all 3, then fails to parse
 * `scripts/__tests__/*.test.mjs` with the default node:vm Script loader:
 *     SyntaxError: Cannot use import statement outside a module
 *
 * Stryker merges file-based config via
 * `{...configFromFile, ...config, ...JEST_OVERRIDE_OPTIONS}`, so passing
 * `projects:` below cleanly replaces the file-based list. We keep exactly
 * `unit-integration`, which mirrors the path used by the regular coverage
 * gate. `scripts-esm` is irrelevant to mutation testing (none of the
 * `mutate:` files are exercised by Node-script unit tests); the `e2e`
 * project requires testcontainer infra (Postgres + Redis) and a repo-root
 * sentinel baseline that lives OUTSIDE museum-backend — Stryker's sandbox
 * breaks the path traversal and would incur testcontainer spin-up per
 * mutant (40+ min overhead for zero signal on the banking-grade hot files,
 * which are exercised by unit tests).
 *
 * ─── forceExit:false (CRITICAL) ─────────────────────────────────────────
 * Base jest.config.ts sets forceExit:true (defensive default for
 * `pnpm test`); the override here is mandatory for Stryker's hot-reload
 * (load tests once, run multiple mutants in-process — ~10× throughput vs
 * spawn-per-mutant). Pre-req: source modules in scope must not register
 * module-load timers that don't .unref(). Verified clean after the
 * prometheus-metrics enableDefaultMetrics() refactor (lazy registration
 * moved to app bootstrap).
 */

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
      // Integration tests need live infra (Postgres testcontainer, Redis,
      // testcontainer S3) and a repo-root sentinel baseline that lives
      // OUTSIDE museum-backend. Stryker's sandbox isolates museum-backend/,
      // breaking path traversal in _smoke/integration-tier-baseline-cap.test.ts
      // and incurring testcontainer spin-up per mutant.
      '<rootDir>/tests/integration/',
    ],
  },
];

const DEFAULT_THRESHOLDS = { high: 85, low: 70, break: 70 };

// CI ubuntu-latest = 4 vCPUs (cap 4). Local M1 Pro = 8-10 cores, 16GB RAM,
// can sustain 6-8 concurrent Jest workers (~500MB each, 3-4GB total — well
// under RAM budget).
const DEFAULT_CONCURRENCY_LOCAL_TIGHT = 8;
const DEFAULT_CONCURRENCY_LOCAL_FULL = 6; // full-scope = keep cores free for IDE
const CI_CONCURRENCY = 4;

function resolveConcurrency({ localDefault, allowEnvOverride }) {
  if (allowEnvOverride && process.env.STRYKER_CONCURRENCY) {
    return Number(process.env.STRYKER_CONCURRENCY);
  }
  return process.env.CI === 'true' ? CI_CONCURRENCY : localDefault;
}

/**
 * Build a Stryker config for a per-scope wrapper.
 *
 * @param {object} opts
 * @param {string[]} opts.mutate - Mutate glob list (the only required field).
 * @param {{high?: number, low?: number, break?: number}} [opts.thresholds]
 *   - Override default {85,70,70}. Lower break threshold is used by 3 dense
 *     algorithmic scopes (memory-cache 60, resilient-cache 50, string-similarity 50)
 *     while their survivor backlog is being worked through.
 * @param {number} [opts.timeoutMS=5000]
 *   - 5s baseline gives comfortable margin for legit mutants (<1s with perTest
 *     coverage + hot-reload) while burning through infinite-loop mutants ~3×
 *     faster than the old 10s. The root full-scope default keeps 10s as a
 *     safety net for the rare slow IO test in the unfiltered src/** scope.
 * @param {number} [opts.timeoutFactor=0.5]
 *   - Multiplier × baseline ms + timeoutMS = effective per-mutant timeout.
 *     0.5 pairs with the 5s wrappers; the root full-scope uses Stryker's
 *     default 1.5.
 * @param {boolean} [opts.allowEnvConcurrency=true]
 *   - If true, honor STRYKER_CONCURRENCY env var. The legacy baseline/audit/
 *     auth/middleware/so wrappers were authored before this knob; set to
 *     false to preserve their exact prior behavior.
 * @param {number} [opts.localConcurrency=8]
 *   - Local default concurrency (CI is hard-pinned to 4).
 * @param {number} [opts.dryRunTimeoutMinutes]
 *   - Bump for scopes whose initial dry-run is long under concurrent load
 *     (shared-db bumped to 10min — see its wrapper).
 * @param {string[]} [opts.setupFiles]
 *   - Per-scope `jest.setupFiles` to inject into the cloned project block.
 *     Used by scopes whose tests boot `createApp()` and would otherwise
 *     leak open BullMQ/ioredis handles under Stryker's mandatory
 *     `forceExit:false` (see module-admin wrapper for the canonical case).
 * @param {string[]} [opts.extraTestPathIgnorePatterns]
 *   - Per-scope test paths to exclude from the sandbox dry-run. Used in
 *     tandem with `setupFiles` when the env pin those files install would
 *     break unrelated tests that fall under the same `unit-integration`
 *     project (e.g. pinning EXTRACTION_WORKER_ENABLED=false for the admin
 *     scope unmounts the museum-enrichment route → its route tests 404).
 *     Skipping is safe when the excluded tests don't cover any file in
 *     `mutate` (Stryker perTest coverage would skip them anyway).
 * @returns {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
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
    // pnpm strict hoisting: jest-runner must be explicitly listed
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

/**
 * Full BE coverage — `src/**` minus generated/declarative/low-signal targets.
 *
 * The prior explicit phase-by-phase list (~50 files) was a curated banking-
 * grade subset. Expanding to every source file under src/** trades runtime
 * for completeness — incremental mode + a versioned
 * `reports/stryker-incremental.json` keeps the cost low after the first
 * full run.
 *
 * timeoutMS=10000 (vs the 5s wrappers) leaves comfortable margin for the
 * rare slow IO test in the unfiltered scope. 1693 timeouts at 4% wasted
 * ~14h on hangs at the old 30s; 10s is the sweet spot.
 *
 * concurrency=6 local (vs 8 in tight wrappers) keeps 2 cores free for
 * IDE / browser / Claude during overnight runs so the machine stays usable.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default defineConfig({
  mutate: [
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
  timeoutMS: 10000,
  timeoutFactor: 1.5, // Stryker default — wider safety on full-scope IO tests
  allowEnvConcurrency: false,
  localConcurrency: DEFAULT_CONCURRENCY_LOCAL_FULL,
});
