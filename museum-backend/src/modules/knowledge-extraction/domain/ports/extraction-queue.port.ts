export interface ExtractionJobPayload {
  url: string;
  searchTerm: string;
  locale: string;
}

export interface ExtractionQueuePort {
  /** Fire-and-forget background extraction. */
  enqueueUrls(jobs: ExtractionJobPayload[]): Promise<void>;
}
