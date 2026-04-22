/**
 * Museum module composition root.
 * Wires repository implementations to use-case classes and exports ready-to-use singletons.
 */
import { AppDataSource } from '@src/data/db/data-source';

import { CreateMuseumUseCase } from './createMuseum.useCase';
import { EnrichMuseumUseCase } from './enrichMuseum.useCase';
import { GetMuseumUseCase } from './getMuseum.useCase';
import { ListMuseumsUseCase } from './listMuseums.useCase';
import { LowDataPackService } from './low-data-pack.service';
import { RefreshStaleEnrichmentsUseCase } from './refreshStaleEnrichments.useCase';
import { SearchMuseumsUseCase } from './searchMuseums.useCase';
import { UpdateMuseumUseCase } from './updateMuseum.useCase';
import {
  BullmqEnrichmentSchedulerAdapter,
  type BullmqEnrichmentSchedulerConfig,
} from '../adapters/secondary/bullmq-enrichment-scheduler.adapter';
import { MuseumQaSeedRepositoryPg } from '../adapters/secondary/museum-qa-seed.repository.typeorm';
import { MuseumRepositoryPg } from '../adapters/secondary/museum.repository.pg';
import { TypeOrmMuseumEnrichmentCacheAdapter } from '../adapters/secondary/typeorm-museum-enrichment-cache.adapter';
import { Museum } from '../domain/museum.entity';

import type { EnrichmentSchedulerPort } from '../domain/ports/enrichment-scheduler.port';
import type { MuseumEnrichmentQueuePort } from '../domain/ports/museum-enrichment-queue.port';
import type { CacheService } from '@shared/cache/cache.port';

const DEFAULT_LOW_DATA_PACK_MAX_ENTRIES = 50;

const museumRepository = new MuseumRepositoryPg(AppDataSource);

export const createMuseumUseCase = new CreateMuseumUseCase(museumRepository);
export const getMuseumUseCase = new GetMuseumUseCase(museumRepository);
export const listMuseumsUseCase = new ListMuseumsUseCase(museumRepository);
export const updateMuseumUseCase = new UpdateMuseumUseCase(museumRepository);

/** Creates the search use case with an optional cache service (resolved at runtime). */
export const buildSearchMuseumsUseCase = (cache?: CacheService): SearchMuseumsUseCase =>
  new SearchMuseumsUseCase(museumRepository, cache);

/** Creates the low-data pack service with cache and seed repository. */
export const buildLowDataPackService = (cache: CacheService): LowDataPackService => {
  const seedRepo = new MuseumQaSeedRepositoryPg(AppDataSource);
  return new LowDataPackService(cache, seedRepo, DEFAULT_LOW_DATA_PACK_MAX_ENTRIES);
};

/**
 * Builds the {@link EnrichMuseumUseCase} with the shared museum repository +
 * a TypeORM-backed persistence cache. The caller injects the queue port —
 * typically {@link BullmqMuseumEnrichmentQueueAdapter} at runtime or the
 * in-memory test helper in tests.
 */
export const buildEnrichMuseumUseCase = (queue: MuseumEnrichmentQueuePort): EnrichMuseumUseCase => {
  const cache = new TypeOrmMuseumEnrichmentCacheAdapter(AppDataSource, Museum);
  return new EnrichMuseumUseCase(museumRepository, cache, queue);
};

/**
 * Builds the {@link RefreshStaleEnrichmentsUseCase} wired to the shared
 * TypeORM cache + the caller-injected queue port. The queue MUST be the same
 * adapter instance used by {@link buildEnrichMuseumUseCase} so the dedup key
 * collapses on-demand and scheduled jobs for the same `(museumId, locale)`.
 */
export const buildRefreshStaleEnrichmentsUseCase = (
  queue: MuseumEnrichmentQueuePort,
): RefreshStaleEnrichmentsUseCase => {
  const cache = new TypeOrmMuseumEnrichmentCacheAdapter(AppDataSource, Museum);
  return new RefreshStaleEnrichmentsUseCase(cache, queue);
};

/**
 * Creates the BullMQ scheduler adapter that drives the daily stale-refresh
 * scan. The caller owns the lifecycle (`start` on boot, `stop` on shutdown).
 */
export const createBullmqEnrichmentScheduler = (
  useCase: RefreshStaleEnrichmentsUseCase,
  config: BullmqEnrichmentSchedulerConfig,
): EnrichmentSchedulerPort => new BullmqEnrichmentSchedulerAdapter(useCase, config);

export { museumRepository };
