/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  reporters: ['html', 'json', 'clear-text', 'progress'],
  testRunner: 'jest',
  jest: {
    configFile: 'jest.config.ts',
    enableFindRelatedTests: false,
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
    // Phase 1 — original 7 files
    'src/modules/chat/useCase/guardrail/art-topic-guardrail.ts',
    'src/modules/chat/useCase/guardrail/guardrail-evaluation.service.ts',
    // 2026-05-05 Step H — pure helpers extracted from guardrail-evaluation.service.
    'src/modules/chat/useCase/guardrail/guardrail-reason-mapping.ts',
    'src/modules/chat/useCase/guardrail/guardrail-audit-payload.ts',
    'src/modules/chat/useCase/guardrail/guardrail-refusal-builder.ts',
    'src/shared/validation/input.ts',
    'src/shared/pagination/cursor-codec.ts',
    'src/modules/chat/useCase/llm/llm-prompt-builder.ts',
    'src/modules/chat/useCase/orchestration/history-window.ts',
    'src/modules/chat/useCase/llm/llm-sections.ts',
    // Phase 2 Wave 1 — pure functions & validation
    'src/shared/validation/email.ts',
    'src/shared/validation/password.ts',
    'src/shared/i18n/locale.ts',
    'src/shared/i18n/fallback-messages.ts',
    'src/shared/i18n/guardrail-refusals.ts',
    'src/modules/chat/useCase/image/image-scoring.ts',
    'src/modules/chat/useCase/orchestration/assistant-response.ts',
    'src/modules/chat/useCase/session/visit-context.ts',
    'src/modules/chat/useCase/image/chat-image.helpers.ts',
    'src/modules/chat/useCase/guardrail/art-topic-classifier.ts',
    // Phase 2 Wave 2 — security & infrastructure
    'src/modules/auth/useCase/session/login-rate-limiter.ts',
    'src/shared/rate-limit/in-memory-bucket-store.ts',
    'src/modules/chat/useCase/session/session-access.ts',
    'src/shared/security/bcrypt.ts',
    'src/modules/chat/useCase/llm/semaphore.ts',
    'src/shared/utils/fire-and-forget.ts',
    'src/shared/cache/noop-cache.service.ts',
    // Phase 2 Wave 3 — middleware
    'src/helpers/middleware/require-role.middleware.ts',
    'src/helpers/middleware/authenticated.middleware.ts',
    'src/helpers/middleware/error.middleware.ts',
    'src/helpers/middleware/rate-limit.middleware.ts',
    'src/helpers/middleware/accept-language.middleware.ts',
    'src/helpers/middleware/daily-chat-limit.middleware.ts',
    'src/helpers/middleware/validate-body.middleware.ts',
    'src/helpers/middleware/validate-query.middleware.ts',
    'src/helpers/middleware/apiKey.middleware.ts',
    // Phase 2 Wave 4 — use cases
    'src/modules/auth/useCase/registration/register.useCase.ts',
    'src/modules/auth/useCase/password/changePassword.useCase.ts',
    'src/modules/auth/useCase/registration/verifyEmail.useCase.ts',
    'src/modules/auth/useCase/api-keys/generateApiKey.useCase.ts',
    'src/modules/auth/useCase/api-keys/revokeApiKey.useCase.ts',
    'src/modules/review/useCase/moderation/moderateReview.useCase.ts',
    'src/modules/review/useCase/public/createReview.useCase.ts',
    'src/modules/admin/useCase/reports/resolveReport.useCase.ts',
    // Phase 4 Wave 5 — banking-grade hot files
    'src/shared/audit/audit-chain.ts',
    'src/modules/chat/adapters/secondary/llm/llm-circuit-breaker.ts',
    'src/modules/auth/adapters/secondary/pg/refresh-token.repository.pg.ts',
    'src/modules/auth/useCase/session/authSession.service.ts',
    // 2026-05-05 Step G — sub-services extracted from authSession.service.ts.
    // Mutation coverage follows the security-critical logic into the new files.
    'src/modules/auth/useCase/session/token-jwt.service.ts',
    'src/modules/auth/useCase/session/session-issuer.service.ts',
    'src/modules/auth/useCase/session/mfa-gate.service.ts',
    // Exclusions
    '!src/**/*.entity.ts',
    '!src/**/*.migration.ts',
    '!src/**/*.d.ts',
    '!src/**/*.types.ts',
  ],
  thresholds: {
    high: 85,
    low: 70,
    break: 70,
  },
  timeoutMS: 30000,
  concurrency: 2,
};
