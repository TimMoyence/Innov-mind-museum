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
