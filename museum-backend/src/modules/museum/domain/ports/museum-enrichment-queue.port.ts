export interface MuseumEnrichmentJob {
  museumId: number;
  locale: string;
}

export type MuseumEnrichmentJobStatus = 'active' | 'completed' | 'failed' | 'notfound';

export interface MuseumEnrichmentQueuePort {
  /**
   * Implementations MUST be idempotent on `(museumId, locale)` — if a job is
   * already active, return the existing jobId instead of duplicating.
   */
  enqueue(input: MuseumEnrichmentJob): Promise<string>;

  getJobStatus(jobId: string): Promise<MuseumEnrichmentJobStatus>;

  /** Returns null if no in-flight job for `(museumId, locale)`. */
  isJobActive(input: MuseumEnrichmentJob): Promise<string | null>;
}
