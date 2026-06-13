// Museum module composition root.
import { AppDataSource } from '@data/db/data-source';
import { MuseumEnrichmentWorker } from '@modules/museum/adapters/primary/museum-enrichment.worker';
import {
  BullmqEnrichmentSchedulerAdapter,
  type BullmqEnrichmentSchedulerConfig,
} from '@modules/museum/adapters/secondary/enrichment/bullmq-enrichment-scheduler.adapter';
import { TypeOrmMuseumEnrichmentCacheAdapter } from '@modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter';
import { HttpWikidataMuseumClient } from '@modules/museum/adapters/secondary/external/wikidata-museum.client';
import { HttpWikipediaClient } from '@modules/museum/adapters/secondary/external/wikipedia.client';
import { MuseumQaSeedRepositoryPg } from '@modules/museum/adapters/secondary/pg/museum-qa-seed.repository.typeorm';
import { MuseumRepositoryPg } from '@modules/museum/adapters/secondary/pg/museum.repository.pg';
import { Museum } from '@modules/museum/domain/museum/museum.entity';
import { CreateMuseumUseCase } from '@modules/museum/useCase/crud/createMuseum.useCase';
import { GetMuseumUseCase } from '@modules/museum/useCase/crud/getMuseum.useCase';
import { ListMuseumsUseCase } from '@modules/museum/useCase/crud/listMuseums.useCase';
import { UpdateMuseumUseCase } from '@modules/museum/useCase/crud/updateMuseum.useCase';
import { DetectMuseumUseCase } from '@modules/museum/useCase/detect/detect-museum.useCase';
import { EnrichMuseumUseCase } from '@modules/museum/useCase/enrichment/enrichMuseum.useCase';
import { PurgeDeadEnrichmentsUseCase } from '@modules/museum/useCase/enrichment/purgeDeadEnrichments.useCase';
import { RefreshStaleEnrichmentsUseCase } from '@modules/museum/useCase/enrichment/refreshStaleEnrichments.useCase';
import { LowDataPackService } from '@modules/museum/useCase/search/low-data-pack.service';
import { SearchMuseumsUseCase } from '@modules/museum/useCase/search/searchMuseums.useCase';

import type { MuseumEnrichmentWorkerDeps } from '@modules/museum/adapters/primary/museum-enrichment.worker';
import type { EnrichmentSchedulerPort } from '@modules/museum/domain/ports/enrichment-scheduler.port';
import type { MuseumEnrichmentQueuePort } from '@modules/museum/domain/ports/museum-enrichment-queue.port';
import type { CacheService } from '@shared/cache/cache.port';
import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

const DEFAULT_LOW_DATA_PACK_MAX_ENTRIES = 50;

const museumRepository = new MuseumRepositoryPg(AppDataSource);

export const createMuseumUseCase = new CreateMuseumUseCase(museumRepository);
export const getMuseumUseCase = new GetMuseumUseCase(museumRepository);
export const listMuseumsUseCase = new ListMuseumsUseCase(museumRepository);
export const updateMuseumUseCase = new UpdateMuseumUseCase(museumRepository);
export const detectMuseumUseCase = new DetectMuseumUseCase(museumRepository);

export const buildSearchMuseumsUseCase = (cache?: CacheService): SearchMuseumsUseCase =>
  new SearchMuseumsUseCase(museumRepository, cache);

export const buildLowDataPackService = (cache: CacheService): LowDataPackService => {
  const seedRepo = new MuseumQaSeedRepositoryPg(AppDataSource);
  return new LowDataPackService(cache, seedRepo, DEFAULT_LOW_DATA_PACK_MAX_ENTRIES);
};

export const buildEnrichMuseumUseCase = (queue: MuseumEnrichmentQueuePort): EnrichMuseumUseCase => {
  const cache = new TypeOrmMuseumEnrichmentCacheAdapter(AppDataSource, Museum);
  return new EnrichMuseumUseCase(museumRepository, cache, queue);
};

/**
 * Queue MUST be the SAME adapter instance used by buildEnrichMuseumUseCase
 * so the dedup key collapses on-demand + scheduled jobs for `(museumId, locale)`.
 */
export const buildRefreshStaleEnrichmentsUseCase = (
  queue: MuseumEnrichmentQueuePort,
): RefreshStaleEnrichmentsUseCase => {
  const cache = new TypeOrmMuseumEnrichmentCacheAdapter(AppDataSource, Museum);
  return new RefreshStaleEnrichmentsUseCase(cache, queue);
};

export const buildPurgeDeadEnrichmentsUseCase = (): PurgeDeadEnrichmentsUseCase => {
  const cache = new TypeOrmMuseumEnrichmentCacheAdapter(AppDataSource, Museum);
  return new PurgeDeadEnrichmentsUseCase(cache);
};

/** Caller owns the lifecycle (`start` on boot, `stop` on shutdown). */
export const createBullmqEnrichmentScheduler = (
  useCase: RefreshStaleEnrichmentsUseCase,
  config: BullmqEnrichmentSchedulerConfig,
  purgeUseCase?: PurgeDeadEnrichmentsUseCase,
  purgeThresholdDays?: number,
): EnrichmentSchedulerPort =>
  new BullmqEnrichmentSchedulerAdapter(useCase, config, purgeUseCase, purgeThresholdDays);

/**
 * Test-only injection seams for {@link buildMuseumEnrichmentWorker}. Production
 * boot passes `{}` so every collaborator resolves to its real default; the
 * integration harness passes its container-bound `dataSource` (so `cache.upsert`
 * + `loadMuseum` hit the test Postgres) plus offline HTTP stubs.
 */
export interface BuildMuseumEnrichmentWorkerOverrides {
  /** Bind the cache adapter + museum repo to a specific DataSource (default: AppDataSource). */
  dataSource?: DataSource;
  wikidata?: MuseumEnrichmentWorkerDeps['wikidata'];
  wikipedia?: MuseumEnrichmentWorkerDeps['wikipedia'];
  fetchOpeningHoursTag?: MuseumEnrichmentWorkerDeps['fetchOpeningHoursTag'];
  clock?: MuseumEnrichmentWorkerDeps['clock'];
}

/**
 * On-demand enrichment CONSUMER factory. Constructs the {@link MuseumEnrichmentWorker}
 * with its real deps so enqueued `museum-enrichment` jobs are drained at boot and
 * `processMuseumEnrichmentJob → cache.upsert` writes the `museum_enrichment` row the
 * fiche reads back. Caller owns the lifecycle (`start()` on boot, `close()` on shutdown).
 *
 * The `connection` MUST carry `maxRetriesPerRequest: null` (BullMQ Worker hard
 * requirement, lib-docs/bullmq/PATTERNS.md:79,126) — pass the shared
 * `createRedisConnectionOptions()` rather than hand-rolling options.
 */
export const buildMuseumEnrichmentWorker = (
  connection: ConnectionOptions,
  overrides: BuildMuseumEnrichmentWorkerOverrides = {},
): MuseumEnrichmentWorker => {
  const dataSource = overrides.dataSource ?? AppDataSource;
  const repo = overrides.dataSource ? new MuseumRepositoryPg(dataSource) : museumRepository;
  const deps: MuseumEnrichmentWorkerDeps = {
    museumRepo: repo,
    cache: new TypeOrmMuseumEnrichmentCacheAdapter(dataSource, Museum),
    wikidata: overrides.wikidata ?? new HttpWikidataMuseumClient(),
    wikipedia: overrides.wikipedia ?? new HttpWikipediaClient(),
    ...(overrides.fetchOpeningHoursTag
      ? { fetchOpeningHoursTag: overrides.fetchOpeningHoursTag }
      : {}),
    ...(overrides.clock ? { clock: overrides.clock } : {}),
  };
  return new MuseumEnrichmentWorker(deps, { connection });
};

export { museumRepository };
