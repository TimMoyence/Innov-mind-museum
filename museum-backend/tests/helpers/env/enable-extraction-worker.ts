/**
 * Opt BACK IN to `EXTRACTION_WORKER_ENABLED=true` for the handful of suites that
 * genuinely need the enrichment route MOUNTED.
 *
 * Context: `tests/helpers/jest-env-pgdatabase.setup.ts` now defaults the flag to
 * `false` for the whole `unit-integration` project, because the 48 suites that boot
 * the API through `createApp()` / `createRouteTestApp()` were each constructing
 * `BullmqMuseumEnrichmentQueueAdapter` — which opens an ioredis TCP connection in
 * its constructor, never `.unref()`s it, and (with no Redis to talk to) settles
 * into a permanent reconnect loop. Dozens of those per run starved the event loop
 * and killed an ARBITRARY later suite with `socket hang up` / a 30 s timeout.
 *
 * But `resolveEnrichMuseumUseCase` short-circuits on that same flag: with it off,
 * `/api/museums/:id/enrichment` is never mounted and the route tests get 404 where
 * they expect 401/200. Those suites want the real wiring.
 *
 * ── IMPORT THIS FIRST. Literally line one. ─────────────────────────────────────
 * `@src/config/env` reads `process.env` at MODULE LOAD, and TypeScript HOISTS
 * imports — so an assignment written at the top of the test body runs far too late
 * (env.ts is already loaded, transitively, by whatever helper the test imported).
 * Module side effects, however, run in IMPORT ORDER. Being the first import is the
 * only reliable seam.
 *
 *   import 'tests/helpers/env/enable-extraction-worker'; // MUST stay first
 *   import request from 'supertest';
 *   …
 */
process.env.EXTRACTION_WORKER_ENABLED = 'true';
