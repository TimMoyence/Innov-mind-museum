/**
 * Jest `setupFiles` entry — Stryker module-admin sandbox scope only.
 *
 * Runs BEFORE the test file (and its transitive imports) is loaded so we can
 * pin a few environment variables that `@src/config/env` reads eagerly at
 * module-load time.
 *
 * Why this exists: `createRouteTestApp()` (used by every admin route test)
 * boots the full `apiRouter`, which eagerly instantiates
 * `BullmqMuseumEnrichmentQueueAdapter` when `EXTRACTION_WORKER_ENABLED=true`
 * (the default for the `unit-integration` jest project). That adapter opens
 * an ioredis TCP connection in its ctor and never .unref()s it — under
 * `pnpm test` `forceExit:true` masks the leak, but Stryker's mandatory
 * `forceExit:false` (see stryker/config.mjs CRITICAL note) means Jest waits
 * on the open TCPWRAP handle forever → 100% mutant timeout (run #2026-05-15
 * stalled at 172/207 timeouts with 0 killed).
 *
 * Pinning the flag here keeps the production `unit-integration` project
 * untouched (museum-enrichment route mount tests keep working under
 * `pnpm test`) while making the admin Stryker sandbox cleanly exitable.
 */

process.env.EXTRACTION_WORKER_ENABLED = process.env.EXTRACTION_WORKER_ENABLED ?? 'false';
process.env.CACHE_ENABLED = process.env.CACHE_ENABLED ?? 'false';
