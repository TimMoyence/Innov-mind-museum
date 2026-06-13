/**
 * RED phase — RUN_ID 2026-06-13-museum-enrichment-worker-boot (task #16).
 *
 * Behavioural end-to-end proof of the never-instantiated-consumer bug:
 * the `museum-enrichment` queue has a producer wired at runtime
 * (`EnrichMuseumUseCase` → `BullmqMuseumEnrichmentQueueAdapter.enqueue`) but
 * NO consumer is constructed at boot (`grep "new MuseumEnrichmentWorker"`
 * over src + tests = 0 hits, 2026-06-13). Enqueued jobs therefore pile up in
 * Redis, `processMuseumEnrichmentJob → cache.upsert` never fires, and the
 * `museum_enrichment` cache row is never written → the fiche stays empty.
 *
 * The fix (GREEN phase) is a `buildMuseumEnrichmentWorker(connection, overrides?)`
 * factory in the museum composition root (`@modules/museum/useCase`) + boot
 * wiring. This test imports that not-yet-existing factory, so it currently
 * FAILS at the "is not a function" boundary — the meaningful red.
 *
 * Tier = integration (ADR-012): a real Redis 7 testcontainer drives the real
 * BullMQ queue + Worker, and the integration-harness Postgres DataSource backs
 * the real `cache.upsert` / row read-back. We stub ONLY the outbound HTTP
 * fetchers (Wikidata / Wikipedia / Overpass) — NEVER the queue or the
 * DataSource, since those two frontiers are exactly where the
 * never-drained / never-written defect lives.
 *
 * Import discipline (matches monthly-session-quota.repo.pg.test.ts +
 * integration-harness contract): the museum composition root
 * (`@modules/museum/useCase`) eagerly constructs `AppDataSource` at module
 * load, which freezes `env.db.database`. It is therefore loaded via dynamic
 * `await import(...)` AFTER `createIntegrationHarness()` has bound the singleton
 * DataSource to the per-worker Postgres container — otherwise the DataSource
 * binds to the placeholder `museum_test` DB that does not exist.
 *
 * Run with:
 *   RUN_INTEGRATION=true pnpm test:integration -- \
 *     --testPathPattern=museum-enrichment-worker-boot
 */
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import {
  startRedisTestContainer,
  type StartedRedisTestContainer,
} from 'tests/helpers/e2e/redis-testcontainer';

import type { WikidataMuseumClient } from '@modules/museum/adapters/secondary/external/wikidata-museum.client';
import type { WikipediaClient } from '@modules/museum/adapters/secondary/external/wikipedia.client';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

/** Default 30-day fresh window (mirrors EnrichMuseumUseCase.DEFAULT_FRESH_WINDOW_MS). */
const FRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * Fail-open HTTP stubs — these are the ONLY collaborators we replace. They
 * keep the test offline + deterministic while leaving the real BullMQ queue,
 * the real Worker, and the real DataSource in the loop. Even on this fully
 * degraded path the worker MUST still persist a (mostly-null) cache row, which
 * is precisely the "no longer pending forever" guarantee (UC-09).
 */
const makeNoQidWikidata = (): WikidataMuseumClient =>
  ({
    findMuseumQid: jest.fn(async () => null),
    fetchFacts: jest.fn(async () => null),
  }) as unknown as WikidataMuseumClient;

const makeNoopWikipedia = (): WikipediaClient =>
  ({
    fetchSummary: jest.fn(async () => null),
  }) as unknown as WikipediaClient;

/** Overpass tag fetcher stub — returns no opening-hours tag (fail-open). */
const noOverpass = async (): Promise<string | null> => null;

describeIntegration(
  'MuseumEnrichmentWorker boot wiring (real Redis + Postgres) [integration]',
  () => {
    jest.setTimeout(60_000);

    let container: StartedRedisTestContainer;
    let harness: IntegrationHarness;

    // App modules that transitively construct `AppDataSource` at import time —
    // resolved AFTER the harness binds the DataSource to the container (see
    // file header). The composition root (`@modules/museum/useCase`) is the one
    // that eagerly imports `AppDataSource`; the others are co-located for clarity.
    let buildMuseumEnrichmentWorker: (typeof import('@modules/museum/useCase'))['buildMuseumEnrichmentWorker'];
    let BullmqMuseumEnrichmentQueueAdapter: (typeof import('@modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter'))['BullmqMuseumEnrichmentQueueAdapter'];
    let TypeOrmMuseumEnrichmentCacheAdapter: (typeof import('@modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter'))['TypeOrmMuseumEnrichmentCacheAdapter'];
    let Museum: (typeof import('@modules/museum/domain/museum/museum.entity'))['Museum'];

    // CI race guard (mirrors bullmq-enrichment-scheduler.integration.test.ts:52-75):
    // swallow ioredis "Connection is closed" rejections that surface AFTER BullMQ
    // workers/queues have already returned from .close(). On ubuntu-latest the
    // docker shutdown is abrupt enough that the residual ioredis client emits an
    // unhandled rejection → Jest escalates to suite failure. Restore the original
    // listeners in afterAll so sibling suites keep their own escalation behaviour.
    const originalUnhandled = process.listeners('unhandledRejection').slice();

    beforeAll(async () => {
      process.removeAllListeners('unhandledRejection');
      process.on('unhandledRejection', (reason) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        if (/Connection is closed/i.test(message)) return;
        for (const listener of originalUnhandled) {
          listener.call(process, reason, Promise.reject(reason));
        }
      });
      container = await startRedisTestContainer();
      // Binds the singleton AppDataSource to a fresh Postgres container + applies
      // migrations. MUST run before the dynamic imports below.
      harness = await createIntegrationHarness();
      harness.scheduleStop();

      // Now that the DataSource points at the container, load the composition
      // root + adapters (these freeze nothing harmful — env.db.database is
      // already resolved to the container DB).
      ({ buildMuseumEnrichmentWorker } = await import('@modules/museum/useCase'));
      ({ BullmqMuseumEnrichmentQueueAdapter } =
        await import('@modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter'));
      ({ TypeOrmMuseumEnrichmentCacheAdapter } =
        await import('@modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter'));
      ({ Museum } = await import('@modules/museum/domain/museum/museum.entity'));
    });

    afterAll(async () => {
      // Same race — let ioredis sockets fully RST before docker rm kills Redis.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await container.stop();
      process.removeAllListeners('unhandledRejection');
      for (const listener of originalUnhandled) {
        process.on('unhandledRejection', listener);
      }
    });

    beforeEach(async () => {
      // reset() truncates + re-seeds museum id 42 (the primary test tenant) and
      // id 99 (cross-tenant). We enrich id 42, which therefore has a real
      // `museums` row so processMuseumEnrichmentJob's loadMuseum() succeeds.
      await harness.reset();
    });

    /**
     * UC-01 / AC-1 (happy path) — the core regression.
     *
     * Build the worker via the to-be-created factory, point it at the real Redis
     * container, enqueue a real job via the real producer adapter on the SAME
     * connection, start the worker, wait for the drain, and assert a
     * `museum_enrichment` row now exists for (museumId, locale). A green here
     * proves processMuseumEnrichmentJob → cache.upsert fired end-to-end through
     * the real queue + real DataSource. With no consumer wired, the row is never
     * written and the poll times out → red.
     */
    it('drains an enqueued museum-enrichment job and upserts the cache row (UC-01)', async () => {
      const museumId = 42;
      const locale = 'fr';

      const cache = new TypeOrmMuseumEnrichmentCacheAdapter(harness.dataSource, Museum);

      // Pre-condition: no enrichment row yet.
      await expect(
        cache.findFresh({ museumId, locale, freshWindowMs: FRESH_WINDOW_MS }),
      ).resolves.toBeNull();

      const worker = buildMuseumEnrichmentWorker(container.connection, {
        dataSource: harness.dataSource,
        wikidata: makeNoQidWikidata(),
        wikipedia: makeNoopWikipedia(),
        fetchOpeningHoursTag: noOverpass,
      });

      const producer = new BullmqMuseumEnrichmentQueueAdapter(container.connection);

      try {
        worker.start();
        await producer.enqueue({ museumId, locale });

        await waitFor(async () => {
          const row = await cache.findFresh({ museumId, locale, freshWindowMs: FRESH_WINDOW_MS });
          expect(row).not.toBeNull();
          expect(row?.museumId).toBe(museumId);
          expect(row?.locale).toBe(locale);
        });
      } finally {
        await worker.close();
        await producer.close();
      }
    });

    /**
     * UC-09 / AC-1 (fail-open / degraded) — every external source fails open
     * (no QID, no Wikipedia, no Overpass). A degraded enrichment is still a
     * WRITTEN row: the fiche is no longer "pending forever". Proves the wiring
     * delivers value even on the worst-case external path.
     */
    it('still persists a (degraded, mostly-null) cache row when all external sources fail open (UC-09)', async () => {
      const museumId = 42;
      const locale = 'en';

      const cache = new TypeOrmMuseumEnrichmentCacheAdapter(harness.dataSource, Museum);

      const worker = buildMuseumEnrichmentWorker(container.connection, {
        dataSource: harness.dataSource,
        wikidata: makeNoQidWikidata(),
        wikipedia: makeNoopWikipedia(),
        fetchOpeningHoursTag: noOverpass,
      });
      const producer = new BullmqMuseumEnrichmentQueueAdapter(container.connection);

      try {
        worker.start();
        await producer.enqueue({ museumId, locale });

        await waitFor(async () => {
          const row = await cache.findFresh({ museumId, locale, freshWindowMs: FRESH_WINDOW_MS });
          expect(row).not.toBeNull();
        });

        const row = await cache.findFresh({ museumId, locale, freshWindowMs: FRESH_WINDOW_MS });
        // Degraded path: the auto-fetch fields are null, but the row exists.
        expect(row?.summary).toBeNull();
        expect(row?.wikidataQid).toBeNull();
        expect(row?.website).toBeNull();
      } finally {
        await worker.close();
        await producer.close();
      }
    });
  },
);

/**
 * Polls an async assertion until it passes (or the deadline elapses). Mirrors
 * the scheduler integration test's `waitFor`, extended to await an async probe
 * so each poll can hit the real DataSource.
 * @param assertion - Async callback whose thrown error retries until it returns cleanly.
 * @param timeoutMs - Hard deadline; rethrows the last assertion error after expiry.
 */
async function waitFor(assertion: () => Promise<void>, timeoutMs = 12_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw lastError as Error;
}
