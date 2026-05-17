/**
 * Jest `setupFiles` entry — Stryker module-auth-* sandbox scopes only.
 *
 * Runs BEFORE the test file (and its transitive imports) is loaded so we can
 * pin a few environment variables that `@src/config/env` reads eagerly at
 * module-load time.
 *
 * Why this exists: many auth route/use-case tests go through helpers that
 * boot the full `apiRouter` via `createApp()` / `createRouteTestApp()`, which
 * eagerly instantiates `BullmqMuseumEnrichmentQueueAdapter` when
 * `EXTRACTION_WORKER_ENABLED=true` (the default for the `unit-integration`
 * jest project). That adapter opens an ioredis TCP connection in its ctor
 * and never .unref()s it — under `pnpm test` `forceExit:true` masks the leak,
 * but Stryker's mandatory `forceExit:false` (see stryker/config.mjs CRITICAL
 * note) means Jest waits on the open TCPWRAP handle forever between mutants
 * → 100% mutant timeout / 0% killed on the auth scope (45 files, audit-360
 * 2026-05-16 ref). Same root cause documented for module-admin
 * (2026-05-15 stryker night, commit `cefa480f`).
 *
 * Pinning the flag here keeps the production `unit-integration` project
 * untouched (museum-enrichment route mount tests keep working under
 * `pnpm test`) while making the auth Stryker sandbox cleanly exitable.
 */

process.env.EXTRACTION_WORKER_ENABLED = process.env.EXTRACTION_WORKER_ENABLED ?? 'false';
process.env.CACHE_ENABLED = process.env.CACHE_ENABLED ?? 'false';
