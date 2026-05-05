/**
 * Jest `setupFiles` entry — runs BEFORE the test file (and its transitive
 * imports) is loaded. We use this to pin a few environment variables that
 * `@src/config/env` reads eagerly at module-load time.
 *
 * The e2e harness later in the lifecycle ALSO sets these (defensive double-set
 * for non-Jest contexts), but if we only relied on the harness, the test file's
 * top-level `import` statements would already have triggered `env.ts` evaluation
 * with the wrong defaults — leaving us with `extractionWorkerEnabled=true` and
 * a flood of BullMQ/ioredis ECONNREFUSED errors during tests.
 *
 * Only meaningful when `RUN_E2E=true`; harmless otherwise (the env vars below
 * have safe defaults in test mode).
 */

// Disable BullMQ + Redis-backed background work in test environments. Mirrors
// the override applied inside `createE2EHarness()` for any code path that
// reaches `env.ts` BEFORE the harness runs (i.e. eager top-level imports of
// `@modules/*` from a test file).
process.env.EXTRACTION_WORKER_ENABLED = process.env.EXTRACTION_WORKER_ENABLED ?? 'false';

// CACHE_ENABLED already defaults to false in `env.ts`, but pinning it here
// guarantees no accidental Redis cache wiring picks up a left-over CI value.
process.env.CACHE_ENABLED = process.env.CACHE_ENABLED ?? 'false';

// ADR-030 (2026-05-05) — pin the LLM-judge budget store to in-memory in e2e so
// the harness does not require a Redis instance for the budget cumulative
// counter. Production defaults to 'redis'.
process.env.GUARDRAIL_BUDGET_BACKEND = process.env.GUARDRAIL_BUDGET_BACKEND ?? 'memory';

// F10 — disable HIBP breach gate in e2e (mirrors createE2EHarness override).
// Pinned here too because env.ts reads `passwordBreachCheckEnabled` at module
// load, and any top-level `@modules/auth/*` import from a test file would
// freeze the value to true before the harness body ever runs.
process.env.PASSWORD_BREACH_CHECK_ENABLED = process.env.PASSWORD_BREACH_CHECK_ENABLED ?? 'false';

// Phase 5 — pin the in-memory email service implementation for the same
// reason (TestEmailService captures verification tokens; harness applies the
// same default but only after top-level imports may have already evaluated env).
process.env.AUTH_EMAIL_SERVICE_KIND = process.env.AUTH_EMAIL_SERVICE_KIND ?? 'test';

// FRONTEND_URL guards email sending in RegisterUseCase + ForgotPasswordUseCase
// (`if (this.emailService && this.frontendUrl)`). Pin a placeholder so e2e
// tests using TestEmailService actually capture a verification email.
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:8081';
