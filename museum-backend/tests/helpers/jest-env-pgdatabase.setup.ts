/**
 * Jest `setupFiles` entry — runs BEFORE the test file is loaded.
 *
 * Pins PGDATABASE for the unit-integration project. `@src/config/env` reads
 * PGDATABASE eagerly at module load via `required()` (no fallback per
 * 2026-05-18 decision). Without this pin, any test file that transitively
 * imports `@src/config/env` would crash with "Missing required environment
 * variable: PGDATABASE" because env.ts deliberately skips dotenv.config() when
 * NODE_ENV === 'test' to preserve test isolation.
 *
 * Tests that need a specific PGDATABASE value (e.g. integration harness with
 * a real container) overwrite it themselves before importing modules that read
 * it.
 */
process.env.PGDATABASE = process.env.PGDATABASE ?? 'museum_test';

/**
 * ── Stop the whole suite from bleeding ioredis sockets (2026-07-14) ──────────
 *
 * `env.ts` defaults `EXTRACTION_WORKER_ENABLED` to **true**. 48 suites boot the
 * API through `createApp()` / `createRouteTestApp()`, and each of those eagerly
 * constructs `BullmqMuseumEnrichmentQueueAdapter`, which opens an ioredis TCP
 * connection **in its constructor** and never `.unref()`s it. There is no Redis
 * to talk to in a unit run, so every one of those clients enters a RECONNECT LOOP
 * — timers, backoff, `handleClientError`, `ERR_UNHANDLED_ERROR` — and they all
 * survive the suite that created them.
 *
 * The damage is cumulative and it lands on the WRONG suite. By the end of a run
 * the event loop is carrying dozens of retrying clients, and a supertest
 * assertion that takes 1.7 s in isolation dies of `socket hang up` or trips the
 * 30 s timeout. A DIFFERENT suite loses each time (`mfa.route`, `auth.route`,
 * `admin.route`, `idempotency.middleware` all observed), which is exactly why it
 * looked like flakiness rather than a leak: none of the victims is guilty, they
 * simply had the bad luck of running last.
 *
 * The Stryker sandboxes already knew — `tests/helpers/{chat,auth,admin}/jest-env.setup.ts`
 * pin this flag, because Stryker's mandatory `forceExit:false` makes the leak
 * FATAL instead of merely expensive (Jest waits on the TCPWRAP handle forever).
 * `pnpm test` runs with `forceExit:true`, which HIDES the handles — but not their
 * cost. The pin belongs here, for the whole project, not only in the scopes where
 * the leak happened to be lethal.
 *
 * `??` (not `=`) so a suite that deliberately exercises the enabled path — or the
 * real cache — still overrides it explicitly.
 */
process.env.EXTRACTION_WORKER_ENABLED = process.env.EXTRACTION_WORKER_ENABLED ?? 'false';
process.env.CACHE_ENABLED = process.env.CACHE_ENABLED ?? 'false';
