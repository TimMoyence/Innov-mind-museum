/** Job payload for URL extraction. */
export interface ExtractionJobPayload {
  url: string;
  searchTerm: string;
  locale: string;
}

/** Port for the extraction job queue. */
export interface ExtractionQueuePort {
  /** Enqueues URLs for background extraction. Fire-and-forget. */
  enqueueUrls(jobs: ExtractionJobPayload[]): Promise<void>;
}
