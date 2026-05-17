import { notFound } from '@shared/errors/app.error';

import type {
  EnrichMuseumResult,
  MuseumEnrichmentView,
} from '@modules/museum/domain/enrichment/enrichment.types';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
import type { MuseumEnrichmentCachePort } from '@modules/museum/domain/ports/museum-enrichment-cache.port';
import type { MuseumEnrichmentQueuePort } from '@modules/museum/domain/ports/museum-enrichment-queue.port';

/** Default 30-day TTL on cached enrichment rows. */
const DEFAULT_FRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

export interface EnrichMuseumInput {
  museumId: number;
  locale: string;
}

/**
 *   1. Fresh DB cache hit → `status: 'ready'`.
 *   2. Miss + already-queued job → `status: 'pending'` + existing jobId.
 *   3. Miss + no active job → enqueue new BullMQ job, `status: 'pending'`.
 *
 * Actual fetch (Wikidata + Wikipedia + OSM) performed off-band by
 * {@link MuseumEnrichmentWorker}.
 */
export class EnrichMuseumUseCase {
  constructor(
    private readonly museumRepo: IMuseumRepository,
    private readonly cache: MuseumEnrichmentCachePort,
    private readonly queue: MuseumEnrichmentQueuePort,
    private readonly freshWindowMs: number = DEFAULT_FRESH_WINDOW_MS,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: EnrichMuseumInput): Promise<EnrichMuseumResult> {
    await this.assertMuseumExists(input.museumId);

    const hit = await this.cache.findFresh({
      museumId: input.museumId,
      locale: input.locale,
      freshWindowMs: this.freshWindowMs,
      now: this.clock(),
    });
    if (hit) return ready(hit);

    const active = await this.queue.isJobActive(input);
    if (active) return { status: 'pending', jobId: active };

    const jobId = await this.queue.enqueue(input);
    return { status: 'pending', jobId };
  }

  async getJobStatus(input: EnrichMuseumInput & { jobId: string }): Promise<EnrichMuseumResult> {
    await this.assertMuseumExists(input.museumId);

    const hit = await this.cache.findFresh({
      museumId: input.museumId,
      locale: input.locale,
      freshWindowMs: this.freshWindowMs,
      now: this.clock(),
    });
    if (hit) return ready(hit);

    const status = await this.queue.getJobStatus(input.jobId);
    if (status === 'completed') {
      // Race: worker finished between our cache read and queue probe.
      const retry = await this.cache.findFresh({
        museumId: input.museumId,
        locale: input.locale,
        freshWindowMs: this.freshWindowMs,
        now: this.clock(),
      });
      if (retry) return ready(retry);
    }
    return { status: 'pending', jobId: input.jobId };
  }

  private async assertMuseumExists(museumId: number): Promise<void> {
    const museum = await this.museumRepo.findById(museumId);
    if (!museum) throw notFound('Museum not found');
  }
}

const ready = (data: MuseumEnrichmentView): EnrichMuseumResult => ({ status: 'ready', data });
