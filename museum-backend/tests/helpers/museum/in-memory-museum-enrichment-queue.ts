import type {
  MuseumEnrichmentJob,
  MuseumEnrichmentJobStatus,
  MuseumEnrichmentQueuePort,
} from '@modules/museum/domain/ports/museum-enrichment-queue.port';

/**
 * In-memory stub for {@link MuseumEnrichmentQueuePort}.
 *
 * Mirrors the BullMQ adapter semantics:
 *   - `enqueue` returns a deterministic jobId (`mus:<museumId>:<locale>`) and
 *     is idempotent while the previous job is still active.
 *   - `isJobActive` returns the running jobId or null.
 *   - `getJobStatus` reports `active | completed | failed | notfound`.
 *
 * Also exposes `markCompleted / markFailed` for driving test scenarios.
 */
export class InMemoryMuseumEnrichmentQueue implements MuseumEnrichmentQueuePort {
  private readonly jobs = new Map<
    string,
    { input: MuseumEnrichmentJob; status: MuseumEnrichmentJobStatus }
  >();

  private jobIdFor(input: MuseumEnrichmentJob): string {
    return `mus:${String(input.museumId)}:${input.locale}`;
  }

  async enqueue(input: MuseumEnrichmentJob): Promise<string> {
    const jobId = this.jobIdFor(input);
    const existing = this.jobs.get(jobId);
    if (existing?.status === 'active') return jobId;
    this.jobs.set(jobId, { input, status: 'active' });
    return jobId;
  }

  async getJobStatus(jobId: string): Promise<MuseumEnrichmentJobStatus> {
    return this.jobs.get(jobId)?.status ?? 'notfound';
  }

  async isJobActive(input: MuseumEnrichmentJob): Promise<string | null> {
    const jobId = this.jobIdFor(input);
    const job = this.jobs.get(jobId);
    return job?.status === 'active' ? jobId : null;
  }

  /**
   * Test helper — flag a job as completed.
   * @param input
   */
  markCompleted(input: MuseumEnrichmentJob): void {
    const jobId = this.jobIdFor(input);
    const job = this.jobs.get(jobId);
    if (job) job.status = 'completed';
  }

  /**
   * Test helper — flag a job as failed.
   * @param input
   */
  markFailed(input: MuseumEnrichmentJob): void {
    const jobId = this.jobIdFor(input);
    const job = this.jobs.get(jobId);
    if (job) job.status = 'failed';
  }

  /** Test helper — raw access to the underlying map (read-only use). */
  snapshot(): readonly {
    jobId: string;
    input: MuseumEnrichmentJob;
    status: MuseumEnrichmentJobStatus;
  }[] {
    return [...this.jobs.entries()].map(([jobId, v]) => ({ jobId, ...v }));
  }
}
