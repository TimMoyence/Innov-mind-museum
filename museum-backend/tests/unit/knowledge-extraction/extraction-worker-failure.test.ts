import { handleJobFailure } from '@modules/knowledge-extraction/adapters/primary/extraction.worker';

import type {
  FailedJobSnapshot,
  JobFailureSinks,
} from '@modules/knowledge-extraction/adapters/primary/extraction.worker';

const makeSinks = (): JobFailureSinks & {
  log: jest.Mock;
  capture: jest.Mock;
} => ({
  log: jest.fn(),
  capture: jest.fn(),
});

const KE_OPTIONS = {
  queueName: 'knowledge-extraction',
  summarize: (data: { url?: string }) => ({ url: data.url }),
};

describe('handleJobFailure', () => {
  it('logs but does NOT page Sentry on intermediate retry', () => {
    const sinks = makeSinks();
    const job: FailedJobSnapshot<{ url: string }> = {
      id: 'job-1',
      data: { url: 'https://example.com/art' },
      attemptsMade: 1,
      opts: { attempts: 2 },
    };

    handleJobFailure(job, new Error('rate limited'), sinks, KE_OPTIONS);

    expect(sinks.log).toHaveBeenCalledWith(
      'extraction_job_failed',
      expect.objectContaining({
        jobId: 'job-1',
        url: 'https://example.com/art',
        attemptsMade: 1,
        attemptsMax: 2,
        finalAttempt: false,
      }),
    );
    expect(sinks.capture).not.toHaveBeenCalled();
  });

  it('pages Sentry on final attempt (dead-letter)', () => {
    const sinks = makeSinks();
    const job: FailedJobSnapshot<{ url: string }> = {
      id: 'job-2',
      data: { url: 'https://example.com/art' },
      attemptsMade: 2,
      opts: { attempts: 2 },
    };
    const err = new Error('permanent 500');

    handleJobFailure(job, err, sinks, KE_OPTIONS);

    expect(sinks.log).toHaveBeenCalledWith(
      'extraction_job_failed',
      expect.objectContaining({ finalAttempt: true }),
    );
    expect(sinks.capture).toHaveBeenCalledTimes(1);
    expect(sinks.capture).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        queue: 'knowledge-extraction',
        jobId: 'job-2',
        url: 'https://example.com/art',
        attemptsMade: '2',
      }),
    );
  });

  it('handles null job (BullMQ can emit failed without a job reference)', () => {
    const sinks = makeSinks();
    handleJobFailure(null, new Error('worker crashed'), sinks, KE_OPTIONS);

    expect(sinks.log).toHaveBeenCalledWith(
      'extraction_job_failed',
      expect.objectContaining({
        jobId: undefined,
        attemptsMade: 0,
        attemptsMax: 0,
        finalAttempt: false,
      }),
    );
    expect(sinks.capture).not.toHaveBeenCalled();
  });

  it('treats missing attempts config as not-final (never pages Sentry by default)', () => {
    const sinks = makeSinks();
    const job: FailedJobSnapshot<{ url: string }> = {
      id: 'job-3',
      data: { url: 'https://example.com/art' },
      attemptsMade: 5,
      opts: {},
    };

    handleJobFailure(job, new Error('boom'), sinks, KE_OPTIONS);

    expect(sinks.capture).not.toHaveBeenCalled();
  });
});

/**
 * Fix #1 from 2026-04-25 code review — exercise the cron-style branch where
 * `attempts` is not configured but the caller opts into `treatNoAttemptsAsFinal`.
 */
describe('handleJobFailure — treatNoAttemptsAsFinal (cron semantics)', () => {
  it('pages Sentry on every failure when attemptsMax === 0 and the option is set', () => {
    const sinks = makeSinks();
    const job: FailedJobSnapshot<Record<string, never>> = {
      id: 'cron-job-1',
      data: {},
      attemptsMade: 0,
      opts: {},
    };

    handleJobFailure(job, new Error('cron tick crashed'), sinks, {
      queueName: 'audit-cron',
      treatNoAttemptsAsFinal: true,
      summarize: () => ({}),
    });

    expect(sinks.log).toHaveBeenCalledWith(
      'audit-cron_job_failed',
      expect.objectContaining({ finalAttempt: true, attemptsMax: 0, attemptsMade: 0 }),
    );
    expect(sinks.capture).toHaveBeenCalledTimes(1);
    expect(sinks.capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ queue: 'audit-cron', jobId: 'cron-job-1' }),
    );
  });

  it('does NOT page Sentry on cron when option is omitted (default semantics)', () => {
    const sinks = makeSinks();
    const job: FailedJobSnapshot<Record<string, never>> = {
      id: 'cron-job-2',
      data: {},
      attemptsMade: 3,
      opts: {},
    };

    handleJobFailure(job, new Error('cron tick crashed'), sinks, {
      queueName: 'audit-cron',
      summarize: () => ({}),
    });

    expect(sinks.capture).not.toHaveBeenCalled();
  });

  it('does NOT inject a `url` field for non-KE queues (legacy fallback removed)', () => {
    const sinks = makeSinks();
    const job: FailedJobSnapshot<{ museumId: number }> = {
      id: 'me-1',
      data: { museumId: 42 },
      attemptsMade: 2,
      opts: { attempts: 2 },
    };

    handleJobFailure(job, new Error('overpass timeout'), sinks, {
      queueName: 'museum-enrichment',
      summarize: (data) => ({ museumId: data.museumId }),
    });

    const logCall = sinks.log.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(logCall).not.toHaveProperty('url');
    expect(logCall.museumId).toBe(42);
  });
});
