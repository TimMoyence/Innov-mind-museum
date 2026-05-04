/**
 * Dead-letter queue (DLQ) semantics for the extraction worker:
 * - Intermediate retries: log only, no Sentry alert.
 * - Final attempt (attemptsMade >= attempts): log + Sentry capture.
 * - enqueueUrls uses canonical jobId → BullMQ deduplicates same URL.
 */

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    addBulk: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: jest.fn(),
}));

import { Queue } from 'bullmq';
import {
  handleJobFailure,
  ExtractionWorker,
} from '@modules/knowledge-extraction/adapters/primary/extraction.worker';
import type {
  FailedJobSnapshot,
  JobFailureSinks,
} from '@modules/knowledge-extraction/adapters/primary/extraction.worker';
import type { ExtractionJobService } from '@modules/knowledge-extraction/useCase/extraction/extraction-job.service';

const WORKER_CONFIG = {
  concurrency: 2,
  rateLimitMax: 10,
  connection: { host: 'localhost', port: 6379 },
};

function makeSinks(): JobFailureSinks & { log: jest.Mock; capture: jest.Mock } {
  return { log: jest.fn(), capture: jest.fn() };
}

function makeJobSnapshot(
  overrides: Partial<FailedJobSnapshot<{ url: string }>> = {},
): FailedJobSnapshot<{ url: string }> {
  return {
    id: 'job-1',
    data: { url: 'https://example.com/art' },
    attemptsMade: 1,
    opts: { attempts: 2 },
    ...overrides,
  };
}

const KE_OPTIONS = {
  queueName: 'knowledge-extraction',
  summarize: (data: { url?: string }) => ({ url: data.url }),
};

// ── handleJobFailure DLQ semantics ────────────────────────────────────────────

describe('handleJobFailure — DLQ semantics', () => {
  it('logs but does NOT capture to Sentry on intermediate retry (attempt 1 of 2)', () => {
    const sinks = makeSinks();
    handleJobFailure(
      makeJobSnapshot({ attemptsMade: 1, opts: { attempts: 2 } }),
      new Error('timeout'),
      sinks,
      KE_OPTIONS,
    );

    expect(sinks.log).toHaveBeenCalledWith(
      'extraction_job_failed',
      expect.objectContaining({ finalAttempt: false }),
    );
    expect(sinks.capture).not.toHaveBeenCalled();
  });

  it('captures to Sentry on final attempt — dead-letter entry point', () => {
    const sinks = makeSinks();
    const err = new Error('permanent failure');
    handleJobFailure(
      makeJobSnapshot({ attemptsMade: 2, opts: { attempts: 2 } }),
      err,
      sinks,
      KE_OPTIONS,
    );

    expect(sinks.log).toHaveBeenCalledWith(
      'extraction_job_failed',
      expect.objectContaining({ finalAttempt: true }),
    );
    expect(sinks.capture).toHaveBeenCalledTimes(1);
    expect(sinks.capture).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ queue: 'knowledge-extraction' }),
    );
  });

  it('does NOT capture Sentry when attempts config is absent (defensive)', () => {
    const sinks = makeSinks();
    handleJobFailure(
      makeJobSnapshot({ attemptsMade: 5, opts: {} }),
      new Error('x'),
      sinks,
      KE_OPTIONS,
    );

    expect(sinks.capture).not.toHaveBeenCalled();
  });

  it('handles null job snapshot gracefully (BullMQ may emit null on worker crash)', () => {
    const sinks = makeSinks();
    handleJobFailure(null, new Error('crash'), sinks, KE_OPTIONS);

    expect(sinks.log).toHaveBeenCalledWith(
      'extraction_job_failed',
      expect.objectContaining({ jobId: undefined, finalAttempt: false }),
    );
    expect(sinks.capture).not.toHaveBeenCalled();
  });
});

// ── enqueueUrls jobId deduplication ──────────────────────────────────────────

describe('ExtractionWorker.enqueueUrls — canonical jobId dedup', () => {
  let queueInstance: { addBulk: jest.Mock; close: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    queueInstance = { addBulk: jest.fn().mockResolvedValue([]), close: jest.fn() };
    const mockQueueInstance = queueInstance as unknown as InstanceType<typeof Queue>;
    jest.mocked(Queue).mockReturnValue(mockQueueInstance);
  });

  it('uses extract:<canonicalUrl> as jobId — same URL produces same jobId', async () => {
    const worker = new ExtractionWorker({} as ExtractionJobService, WORKER_CONFIG);

    await worker.enqueueUrls([
      { url: 'https://example.com/mona-lisa/', searchTerm: 'Mona Lisa', locale: 'en' },
    ]);

    expect(queueInstance.addBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ opts: { jobId: 'extract:https://example.com/mona-lisa' } }),
      ]),
    );
  });

  it('produces the same jobId for trailing-slash and non-trailing-slash variants', async () => {
    const worker = new ExtractionWorker({} as ExtractionJobService, WORKER_CONFIG);

    await worker.enqueueUrls([
      { url: 'https://example.com/artwork/', searchTerm: 'art', locale: 'en' },
      { url: 'https://example.com/artwork', searchTerm: 'art', locale: 'en' },
    ]);

    const bulkJobs = (queueInstance.addBulk as jest.Mock).mock.calls[0][0] as Array<{
      opts: { jobId: string };
    }>;
    const jobIds = bulkJobs.map((j) => j.opts.jobId);

    expect(jobIds[0]).toBe(jobIds[1]);
  });

  it('produces the same jobId for query params in different order', async () => {
    const worker = new ExtractionWorker({} as ExtractionJobService, WORKER_CONFIG);

    await worker.enqueueUrls([
      { url: 'https://example.com/art?b=2&a=1', searchTerm: 'art', locale: 'en' },
      { url: 'https://example.com/art?a=1&b=2', searchTerm: 'art', locale: 'en' },
    ]);

    const bulkJobs = (queueInstance.addBulk as jest.Mock).mock.calls[0][0] as Array<{
      opts: { jobId: string };
    }>;
    const jobIds = bulkJobs.map((j) => j.opts.jobId);

    expect(jobIds[0]).toBe(jobIds[1]);
  });

  it('enqueues without throwing even if queue.addBulk rejects (fire-and-forget)', async () => {
    queueInstance.addBulk.mockRejectedValue(new Error('Redis unavailable'));
    const worker = new ExtractionWorker({} as ExtractionJobService, WORKER_CONFIG);

    await expect(
      worker.enqueueUrls([{ url: 'https://example.com/art', searchTerm: 'art', locale: 'en' }]),
    ).resolves.toBeUndefined();
  });
});
