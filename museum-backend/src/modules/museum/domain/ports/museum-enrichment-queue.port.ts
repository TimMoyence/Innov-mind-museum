export interface MuseumEnrichmentJob {
  museumId: number;
  locale: string;
}

export type MuseumEnrichmentJobStatus = 'active' | 'completed' | 'failed' | 'notfound';

export interface MuseumEnrichmentQueuePort {
  enqueue(input: MuseumEnrichmentJob): Promise<string>;

  getJobStatus(jobId: string): Promise<MuseumEnrichmentJobStatus>;

  isJobActive(input: MuseumEnrichmentJob): Promise<string | null>;
}
