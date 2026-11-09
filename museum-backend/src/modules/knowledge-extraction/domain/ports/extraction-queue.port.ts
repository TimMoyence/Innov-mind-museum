export interface ExtractionJobPayload {
  url: string;
  locale: string;
}

export interface ExtractionQueuePort {
  enqueueUrls(jobs: ExtractionJobPayload[]): Promise<void>;
}
