/**
 * Port for the async museum-enrichment queue. Hexagonal seam between the
 * use case (`EnrichMuseumUseCase`) and the concrete BullMQ adapter.
 */

/** Payload the worker consumes. */
export interface MuseumEnrichmentJob {
  museumId: number;
  locale: string;
}

/** Runtime status of a job as surfaced to the API consumer. */
export type MuseumEnrichmentJobStatus = 'active' | 'completed' | 'failed' | 'notfound';

/** Contract implemented by both the BullMQ adapter and the in-memory test helper. */
export interface MuseumEnrichmentQueuePort {
  /**
   * Enqueues an enrichment job and returns the generated jobId. Implementations
   * MUST be idempotent on `(museumId, locale)` — if a job is already active
   * for that pair, they must return the existing jobId instead of creating a
   * duplicate.
   */
  enqueue(input: MuseumEnrichmentJob): Promise<string>;

  /** Returns the current status of a job previously returned by `enqueue`. */
  getJobStatus(jobId: string): Promise<MuseumEnrichmentJobStatus>;

  /**
   * Looks up any in-flight job for the given `(museumId, locale)` pair.
   * Returns the active jobId, or null if none is running.
   */
  isJobActive(input: MuseumEnrichmentJob): Promise<string | null>;
}
