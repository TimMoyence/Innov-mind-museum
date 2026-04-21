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

describe('handleJobFailure', () => {
  it('logs but does NOT page Sentry on intermediate retry', () => {
    const sinks = makeSinks();
    const job: FailedJobSnapshot = {
      id: 'job-1',
      data: { url: 'https://example.com/art' },
      attemptsMade: 1,
      opts: { attempts: 2 },
    };

    handleJobFailure(job, new Error('rate limited'), sinks);

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
    const job: FailedJobSnapshot = {
      id: 'job-2',
      data: { url: 'https://example.com/art' },
      attemptsMade: 2,
      opts: { attempts: 2 },
    };
    const err = new Error('permanent 500');

    handleJobFailure(job, err, sinks);

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
    handleJobFailure(null, new Error('worker crashed'), sinks);

    expect(sinks.log).toHaveBeenCalledWith(
      'extraction_job_failed',
      expect.objectContaining({
        jobId: undefined,
        url: undefined,
        attemptsMade: 0,
        attemptsMax: 0,
        finalAttempt: false,
      }),
    );
    expect(sinks.capture).not.toHaveBeenCalled();
  });

  it('treats missing attempts config as not-final (never pages Sentry)', () => {
    const sinks = makeSinks();
    const job: FailedJobSnapshot = {
      id: 'job-3',
      data: { url: 'https://example.com/art' },
      attemptsMade: 5,
      opts: {},
    };

    handleJobFailure(job, new Error('boom'), sinks);

    expect(sinks.capture).not.toHaveBeenCalled();
  });
});
