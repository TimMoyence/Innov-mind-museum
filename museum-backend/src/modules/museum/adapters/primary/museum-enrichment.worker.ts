import { Worker } from 'bullmq';

import { queryOverpassOpeningHours } from '@shared/http/overpass.client';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import { MUSEUM_ENRICHMENT_QUEUE_NAME } from '../secondary/bullmq-museum-enrichment-queue.adapter';
import { parseOpeningHours } from '../secondary/opening-hours-parser';

import type { MuseumEnrichmentView, ParsedOpeningHours } from '../../domain/enrichment.types';
import type { Museum } from '../../domain/museum.entity';
import type { IMuseumRepository } from '../../domain/museum.repository.interface';
import type { MuseumEnrichmentCachePort } from '../../domain/ports/museum-enrichment-cache.port';
import type { MuseumEnrichmentJob } from '../../domain/ports/museum-enrichment-queue.port';
import type {
  WikidataMuseumClient,
  WikidataMuseumFacts,
} from '../secondary/wikidata-museum.client';
import type { WikipediaClient, WikipediaSummary } from '../secondary/wikipedia.client';
import type { ConnectionOptions } from 'bullmq';

/** Collaborators injected into the worker — pure port interfaces for testability. */
export interface MuseumEnrichmentWorkerDeps {
  museumRepo: IMuseumRepository;
  cache: MuseumEnrichmentCachePort;
  wikidata: WikidataMuseumClient;
  wikipedia: WikipediaClient;
  /** Overridable in tests — defaults to the real Overpass call. */
  fetchOpeningHoursTag?: (input: { lat: number; lng: number }) => Promise<string | null>;
  /** Overridable clock — defaults to `new Date()`. */
  clock?: () => Date;
}

/**
 * Pure pipeline used by the BullMQ worker handler AND the unit tests —
 * never touches BullMQ, only the injected ports. Each external step is
 * fail-open: a null return from Wikidata / Wikipedia / OSM downgrades the
 * output but never aborts the job.
 */
export async function processMuseumEnrichmentJob(
  job: MuseumEnrichmentJob,
  deps: MuseumEnrichmentWorkerDeps,
): Promise<MuseumEnrichmentView> {
  const now = (deps.clock ?? (() => new Date()))();
  const museum = await loadMuseum(deps.museumRepo, job.museumId);

  const facts = await fetchWikidataFacts(deps.wikidata, museum, job.locale);
  const [wikipediaSummary, openingHoursRaw] = await Promise.all([
    fetchWikipediaSummary(deps.wikipedia, facts, job.locale),
    fetchOpeningHoursTag(deps.fetchOpeningHoursTag, museum),
  ]);

  const openingHours = parseOpeningHoursOrNull(openingHoursRaw, now);
  const view = buildEnrichmentView({ job, facts, wikipediaSummary, openingHours, now });

  await deps.cache.upsert(view);
  return view;
}

async function loadMuseum(repo: IMuseumRepository, museumId: number): Promise<Museum> {
  const museum = await repo.findById(museumId);
  if (!museum) {
    throw new Error(`museum ${String(museumId)} not found`);
  }
  return museum;
}

interface FactsWithMatch {
  qid: string;
  facts: WikidataMuseumFacts | null;
}

async function fetchWikidataFacts(
  wikidata: WikidataMuseumClient,
  museum: Museum,
  locale: string,
): Promise<FactsWithMatch | null> {
  const qidMatch = await wikidata.findMuseumQid({
    name: museum.name,
    lat: museum.latitude ?? undefined,
    lng: museum.longitude ?? undefined,
    locale,
  });
  if (!qidMatch) return null;
  const facts = await wikidata.fetchFacts({ qid: qidMatch.qid, locale });
  return { qid: qidMatch.qid, facts };
}

async function fetchWikipediaSummary(
  wikipedia: WikipediaClient,
  factsWithMatch: FactsWithMatch | null,
  locale: string,
): Promise<WikipediaSummary | null> {
  const title = factsWithMatch?.facts?.wikipediaTitle;
  if (!title) return null;
  return await wikipedia.fetchSummary({ title, locale });
}

async function fetchOpeningHoursTag(
  override: MuseumEnrichmentWorkerDeps['fetchOpeningHoursTag'],
  museum: Museum,
): Promise<string | null> {
  if (museum.latitude == null || museum.longitude == null) return null;
  const fetcher = override ?? defaultFetchOpeningHoursTag;
  return await fetcher({ lat: museum.latitude, lng: museum.longitude });
}

function parseOpeningHoursOrNull(raw: string | null, now: Date): ParsedOpeningHours | null {
  return raw ? parseOpeningHours(raw, now) : null;
}

interface BuildViewInput {
  job: MuseumEnrichmentJob;
  facts: FactsWithMatch | null;
  wikipediaSummary: WikipediaSummary | null;
  openingHours: ParsedOpeningHours | null;
  now: Date;
}

interface FlatFacts {
  summary: string | null;
  website: string | null;
  phone: string | null;
  imageUrl: string | null;
}

const EMPTY_FACTS: FlatFacts = {
  summary: null,
  website: null,
  phone: null,
  imageUrl: null,
};

function flattenFacts(factsWithMatch: FactsWithMatch | null): FlatFacts {
  const facts = factsWithMatch?.facts;
  if (!facts) return EMPTY_FACTS;
  return {
    summary: facts.summary,
    website: facts.website,
    phone: facts.phone,
    imageUrl: facts.imageUrl,
  };
}

function buildEnrichmentView(input: BuildViewInput): MuseumEnrichmentView {
  const facts = flattenFacts(input.facts);
  const summary = input.wikipediaSummary?.extract ?? facts.summary;
  return {
    museumId: input.job.museumId,
    locale: input.job.locale,
    summary,
    wikidataQid: input.facts?.qid ?? null,
    website: facts.website,
    phone: facts.phone,
    imageUrl: facts.imageUrl,
    openingHours: input.openingHours,
    fetchedAt: input.now.toISOString(),
  };
}

async function defaultFetchOpeningHoursTag(input: {
  lat: number;
  lng: number;
}): Promise<string | null> {
  return await queryOverpassOpeningHours({ lat: input.lat, lng: input.lng });
}

interface MuseumEnrichmentWorkerConfig {
  connection: ConnectionOptions;
  concurrency?: number;
}

/**
 * BullMQ worker wrapper around {@link processMuseumEnrichmentJob}. Thin —
 * the real pipeline lives in the pure function so unit tests stay
 * BullMQ-free.
 */
export class MuseumEnrichmentWorker {
  private worker?: Worker<MuseumEnrichmentJob>;

  constructor(
    private readonly deps: MuseumEnrichmentWorkerDeps,
    private readonly config: MuseumEnrichmentWorkerConfig,
  ) {}

  /** Starts the underlying BullMQ worker. Safe to call once at boot. */
  start(): void {
    this.worker = new Worker<MuseumEnrichmentJob>(
      MUSEUM_ENRICHMENT_QUEUE_NAME,
      async (job) => {
        logger.info('museum_enrichment_job_start', { jobId: job.id, data: job.data });
        await processMuseumEnrichmentJob(job.data, this.deps);
      },
      {
        connection: this.config.connection,
        concurrency: this.config.concurrency ?? 2,
      },
    );

    this.worker.on('completed', (job) => {
      logger.info('museum_enrichment_job_completed', { jobId: job.id });
    });
    this.worker.on('failed', (job, err) => {
      logger.warn('museum_enrichment_job_failed', {
        jobId: job?.id,
        error: err.message,
      });
      captureExceptionWithContext(err, {
        queue: MUSEUM_ENRICHMENT_QUEUE_NAME,
        jobId: job?.id,
      });
    });
  }

  /** Gracefully stops the underlying BullMQ worker. Idempotent. */
  async close(): Promise<void> {
    await this.worker?.close();
  }
}
