/**
 * Jest `setupFiles` entry — Stryker module-museum sandbox scope only.
 *
 * Runs BEFORE the test file (and its transitive imports) is loaded so we can
 * pin a few environment variables that `@src/config/env` reads eagerly at
 * module-load time.
 *
 * Why this exists: museum route/use-case tests go through helpers that boot
 * the full `apiRouter` via `createApp()` / `createRouteTestApp()`. The museum
 * scope is actually the closest match to the original symptom — `createApp()`
 * mounts the `museum-enrichment` adapter directly through
 * `BullmqMuseumEnrichmentQueueAdapter`, which opens an ioredis TCP connection
 * in its ctor and never .unref()s it. Under `pnpm test` `forceExit:true`
 * masks the leak, but Stryker's mandatory `forceExit:false` (see
 * stryker/config.mjs CRITICAL note) means Jest waits on the open TCPWRAP
 * handle forever between mutants → mutant timeout / 0 killed.
 *
 * Same root cause as module-admin (2026-05-15 stryker night, commit
 * `cefa480f`) and module-auth (T3.1, commit `ff15b701`). Audit-360 ref:
 * docs/roadmap-night/audit-360-2026-05-16/S3-tests.tasks.md.
 *
 * Pinning the flag here keeps the production `unit-integration` project
 * untouched (museum-enrichment route mount tests keep working under
 * `pnpm test`) while making the museum Stryker sandbox cleanly exitable.
 */

process.env.EXTRACTION_WORKER_ENABLED = process.env.EXTRACTION_WORKER_ENABLED ?? 'false';
process.env.CACHE_ENABLED = process.env.CACHE_ENABLED ?? 'false';
