/**
 * BullMQ extraction job payload. I-SEC9 (R9 / GDPR Art. 5(1)(c)
 * data-minimisation) — `searchTerm` (raw user chat text) was removed in
 * RUN_ID=2026-05-21-p0-gdpr. Workers MUST keep destructuring tolerantly to
 * absorb any in-flight legacy payload still carrying the field during the
 * deploy window (R10 backward-compat).
 */
export interface ExtractionJobPayload {
  url: string;
  locale: string;
}

export interface ExtractionQueuePort {
  /** Fire-and-forget background extraction. */
  enqueueUrls(jobs: ExtractionJobPayload[]): Promise<void>;
}
