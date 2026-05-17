/**
 * Implementations MUST: be idempotent on `start()` (multiple calls = no-op
 * after first); release all underlying resources on `stop()`.
 */
export interface EnrichmentSchedulerPort {
  /** No-op if already running. */
  start(): Promise<void>;

  /** MUST be called on shutdown. */
  stop(): Promise<void>;
}
