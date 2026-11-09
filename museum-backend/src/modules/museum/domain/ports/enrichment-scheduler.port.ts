export interface EnrichmentSchedulerPort {
  start(): Promise<void>;

  stop(): Promise<void>;
}
