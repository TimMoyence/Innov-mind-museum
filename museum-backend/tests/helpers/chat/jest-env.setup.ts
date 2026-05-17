/**
 * Jest `setupFiles` entry — Stryker module-chat-* sandbox scopes only.
 *
 * Runs BEFORE the test file (and its transitive imports) is loaded so we can
 * pin a few environment variables that `@src/config/env` reads eagerly at
 * module-load time.
 *
 * Why this exists: many chat job / route / use-case tests go through helpers
 * that boot the full `apiRouter` via `createApp()` / `createRouteTestApp()`,
 * which eagerly instantiates `BullmqMuseumEnrichmentQueueAdapter` when
 * `EXTRACTION_WORKER_ENABLED=true` (the default for the `unit-integration`
 * jest project). That adapter opens an ioredis TCP connection in its ctor
 * and never .unref()s it — under `pnpm test` `forceExit:true` masks the leak,
 * but Stryker's mandatory `forceExit:false` (see stryker/config.mjs CRITICAL
 * note) means Jest waits on the open TCPWRAP handle forever between mutants.
 *
 * The chat scope is the highest-value target for this pin. Per the audit-360
 * 2026-05-16 baseline, the 3 background jobs in `src/modules/chat/jobs/**`
 * are the worst-affected files under Stryker forceExit:false :
 *   - `chat-media-purger.ts`           — 65 mutants, 0 killed
 *   - `chat-purge.job.ts`              — 72 mutants, 1 killed
 *   - `s3-orphan-purge.job.ts`         — 75 mutants, 5 killed
 * All three are fire-and-forget BullMQ retention jobs whose test files boot
 * `createApp()` — same root cause as module-admin (2026-05-15 stryker night,
 * commit `cefa480f`) and module-auth (T3.1, commit `ff15b701`).
 *
 * Pinning the flag here keeps the production `unit-integration` project
 * untouched (museum-enrichment route mount tests keep working under
 * `pnpm test`) while making the chat Stryker sandbox cleanly exitable.
 */

process.env.EXTRACTION_WORKER_ENABLED = process.env.EXTRACTION_WORKER_ENABLED ?? 'false';
process.env.CACHE_ENABLED = process.env.CACHE_ENABLED ?? 'false';
