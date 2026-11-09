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

const FRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

const makeNoQidWikidata = (): WikidataMuseumClient =>
  ({
    findMuseumQid: jest.fn(async () => null),
    fetchFacts: jest.fn(async () => null),
  }) as unknown as WikidataMuseumClient;

const makeNoopWikipedia = (): WikipediaClient =>
  ({
    fetchSummary: jest.fn(async () => null),
  }) as unknown as WikipediaClient;

const noOverpass = async (): Promise<string | null> => null;

describeIntegration(
  'MuseumEnrichmentWorker boot wiring (real Redis + Postgres) [integration]',
  () => {
    jest.setTimeout(60_000);

    let container: StartedRedisTestContainer;
    let harness: IntegrationHarness;

    let buildMuseumEnrichmentWorker: (typeof import('@modules/museum/useCase'))['buildMuseumEnrichmentWorker'];
    let BullmqMuseumEnrichmentQueueAdapter: (typeof import('@modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter'))['BullmqMuseumEnrichmentQueueAdapter'];
    let TypeOrmMuseumEnrichmentCacheAdapter: (typeof import('@modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter'))['TypeOrmMuseumEnrichmentCacheAdapter'];
    let Museum: (typeof import('@modules/museum/domain/museum/museum.entity'))['Museum'];

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
      harness = await createIntegrationHarness();
      harness.scheduleStop();

      ({ buildMuseumEnrichmentWorker } = await import('@modules/museum/useCase'));
      ({ BullmqMuseumEnrichmentQueueAdapter } =
        await import('@modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter'));
      ({ TypeOrmMuseumEnrichmentCacheAdapter } =
        await import('@modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter'));
      ({ Museum } = await import('@modules/museum/domain/museum/museum.entity'));
    });

    afterAll(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await container.stop();
      process.removeAllListeners('unhandledRejection');
      for (const listener of originalUnhandled) {
        process.on('unhandledRejection', listener);
      }
    });

    beforeEach(async () => {
      await harness.reset();
    });

    it('drains an enqueued museum-enrichment job and upserts the cache row (UC-01)', async () => {
      const museumId = 42;
      const locale = 'fr';

      const cache = new TypeOrmMuseumEnrichmentCacheAdapter(harness.dataSource, Museum);

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
