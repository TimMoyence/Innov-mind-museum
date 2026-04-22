/**
 * Port for the recurring stale-enrichment scheduler. Hexagonal seam between
 * the boot lifecycle (`src/index.ts`) and the concrete BullMQ job-scheduler
 * adapter.
 *
 * Implementations MUST:
 *   - be idempotent on `start()` (calling it multiple times is a no-op after
 *     the first call),
 *   - release all underlying resources on `stop()`, so shutdown can await it.
 */
export interface EnrichmentSchedulerPort {
  /** Starts the recurring scan. No-op if already running. */
  start(): Promise<void>;

  /** Cancels the recurring scan. MUST be called on shutdown. */
  stop(): Promise<void>;
}
