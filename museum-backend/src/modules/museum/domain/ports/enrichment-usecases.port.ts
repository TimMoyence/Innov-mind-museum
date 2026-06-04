/**
 * Domain ports for the enrichment scheduler's collaborator use-cases. The
 * BullMQ scheduler adapter
 * (`adapters/secondary/enrichment/bullmq-enrichment-scheduler.adapter.ts`)
 * depends on these DOMAIN ports rather than importing the concrete use-case
 * CLASSES from the application layer (C1 close, run
 * 2026-06-04-hexagonal-boundaries-enforcement). The use-case classes
 * `implements` the matching port; the result types live here too so the port
 * stays self-contained in the domain layer (spec R5 — identity preserved, the
 * use-cases re-export the result types).
 */

export interface RefreshStaleEnrichmentsResult {
  enqueued: number;
  skipped: number;
}

export interface PurgeDeadEnrichmentsResult {
  deleted: number;
}

/** Daily scan that re-enqueues stale museum enrichments. */
export interface RefreshStaleEnrichmentsPort {
  /** @param now Clock override for tests. Defaults to `new Date()`. */
  execute(now?: Date): Promise<RefreshStaleEnrichmentsResult>;
}

/** Hard-delete ceiling of the hybrid TTL policy (runs after the refresh scan). */
export interface PurgeDeadEnrichmentsPort {
  /**
   * @param now Clock override for tests. Defaults to `new Date()`.
   * @param thresholdDays Rows older than `now − thresholdDays` are removed.
   */
  execute(now: Date | undefined, thresholdDays: number): Promise<PurgeDeadEnrichmentsResult>;
}
