import { Queue, Worker } from 'bullmq';

import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { handleJobFailure } from '@shared/queue/job-failure.handler';
import { registerScheduledJob } from '@shared/queue/scheduled-jobs';

import type { ScheduledJobConfig, ScheduledJobResult } from '@shared/queue/scheduled-jobs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: jest.fn(),
}));

jest.mock('@shared/queue/job-failure.handler', () => ({
  handleJobFailure: jest.fn(),
}));

const mockUpsertJobScheduler = jest.fn().mockResolvedValue(undefined);
const mockRemoveJobScheduler = jest.fn().mockResolvedValue(undefined);
const mockQueueClose = jest.fn().mockResolvedValue(undefined);

const mockWorkerOn = jest.fn();
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);

let capturedProcessor: ((job: { id: string }) => Promise<ScheduledJobResult>) | undefined;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    upsertJobScheduler: mockUpsertJobScheduler,
    removeJobScheduler: mockRemoveJobScheduler,
    close: mockQueueClose,
  })),
  Worker: jest
    .fn()
    .mockImplementation(
      (_name: string, processor: (job: { id: string }) => Promise<ScheduledJobResult>) => {
        capturedProcessor = processor;
        return {
          on: mockWorkerOn,
          close: mockWorkerClose,
        };
      },
    ),
}));

// ─── Shared helpers ───────────────────────────────────────────────────────────

const CONNECTION = { host: 'localhost', port: 6379 } as const;

function makeConfig(overrides: Partial<ScheduledJobConfig> = {}): ScheduledJobConfig {
  return {
    name: 'test-job',
    cronPattern: '15 3 * * *',
    handler: jest.fn().mockResolvedValue({ rowsAffected: 0 } satisfies ScheduledJobResult),
    connection: CONNECTION,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerScheduledJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedProcessor = undefined;
    mockUpsertJobScheduler.mockResolvedValue(undefined);
    mockRemoveJobScheduler.mockResolvedValue(undefined);
    mockQueueClose.mockResolvedValue(undefined);
    mockWorkerClose.mockResolvedValue(undefined);
  });

  it('returns a handle with start and close functions', () => {
    const handle = registerScheduledJob(makeConfig());

    expect(handle.start).toBeInstanceOf(Function);
    expect(handle.close).toBeInstanceOf(Function);
  });

  it('Queue is constructed with defaultJobOptions removeOnComplete=100, removeOnFail=500, attempts default 1', () => {
    registerScheduledJob(makeConfig({ name: 'prune-q' }));

    expect(Queue).toHaveBeenCalledWith('prune-q', {
      connection: CONNECTION,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500, attempts: 1 },
    });
  });

  it('Queue uses cfg.attempts override when provided', () => {
    registerScheduledJob(makeConfig({ name: 'prune-r', attempts: 3 }));

    expect(Queue).toHaveBeenLastCalledWith('prune-r', {
      connection: CONNECTION,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500, attempts: 3 },
    });
  });

  it('start() registers the cron scheduler with the full job template (name, empty data, removeOn opts)', async () => {
    const handle = registerScheduledJob(
      makeConfig({ cronPattern: '15 3 * * *', name: 'prune-tickets' }),
    );

    await handle.start();

    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      'prune-tickets-scheduler',
      { pattern: '15 3 * * *' },
      {
        name: 'prune-tickets',
        data: {},
        opts: { removeOnComplete: 100, removeOnFail: 500 },
      },
    );
  });

  it('start() emits scheduled_job_registered log with job + cronPattern', async () => {
    const handle = registerScheduledJob(makeConfig({ name: 'prune-x', cronPattern: '0 4 * * *' }));

    await handle.start();

    expect(logger.info).toHaveBeenCalledWith('scheduled_job_registered', {
      job: 'prune-x',
      cronPattern: '0 4 * * *',
    });
  });

  it('start() does NOT spawn a worker when registerScheduler fails (early-return on !registered)', async () => {
    mockUpsertJobScheduler.mockRejectedValueOnce(new Error('redis down'));
    const handle = registerScheduledJob(makeConfig({ name: 'prune-fail' }));

    await handle.start();

    expect(Worker).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'scheduled_job_register_failed',
      expect.objectContaining({ job: 'prune-fail', error: 'redis down' }),
    );
    expect(captureExceptionWithContext).toHaveBeenCalledWith(expect.any(Error), {
      queue: 'prune-fail',
      kind: 'scheduler_register_failed',
    });
  });

  it('Worker is constructed with concurrency=1 and the configured connection', async () => {
    const handle = registerScheduledJob(makeConfig({ name: 'prune-z' }));

    await handle.start();

    expect(Worker).toHaveBeenCalledWith('prune-z', expect.any(Function), {
      connection: CONNECTION,
      concurrency: 1,
    });
  });

  it('start() wires the worker failed + error event handlers', async () => {
    const handle = registerScheduledJob(makeConfig());

    await handle.start();

    const registeredEvents = (mockWorkerOn.mock.calls as [string, unknown][]).map(
      ([event]) => event,
    );
    expect(registeredEvents).toContain('failed');
    expect(registeredEvents).toContain('error');
  });

  it('worker processor invokes handler and returns its result', async () => {
    const handler = jest.fn().mockResolvedValue({
      rowsAffected: 42,
      details: { rule: 'closed' },
    } satisfies ScheduledJobResult);
    const handle = registerScheduledJob(makeConfig({ handler }));

    await handle.start();

    expect(capturedProcessor).toBeDefined();
    const result = await capturedProcessor!({ id: 'job-1' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ rowsAffected: 42, details: { rule: 'closed' } });
  });

  it('worker processor emits scheduled_job_completed with job, jobId, rowsAffected, details', async () => {
    const handler = jest.fn().mockResolvedValue({
      rowsAffected: 7,
      details: { rule: 'closed' },
    } satisfies ScheduledJobResult);
    const handle = registerScheduledJob(makeConfig({ name: 'prune-y', handler }));

    await handle.start();
    await capturedProcessor!({ id: 'job-x' });

    expect(logger.info).toHaveBeenCalledWith('scheduled_job_completed', {
      job: 'prune-y',
      jobId: 'job-x',
      rowsAffected: 7,
      details: { rule: 'closed' },
    });
  });

  it('worker failed event routes to handleJobFailure with sinks {log,capture} when job is provided', async () => {
    const handle = registerScheduledJob(makeConfig({ name: 'prune-sf' }));
    await handle.start();

    const failedEntry = (mockWorkerOn.mock.calls as [string, (...args: unknown[]) => void][]).find(
      ([event]) => event === 'failed',
    );
    expect(failedEntry).toBeDefined();
    const failedHandler = failedEntry![1] as (
      job: {
        id: string;
        data: { jobName?: string };
        attemptsMade: number;
        opts: { attempts: number };
      } | null,
      err: Error,
    ) => void;

    const fakeJob = {
      id: '1',
      data: { jobName: 'prune-sf' },
      attemptsMade: 1,
      opts: { attempts: 1 },
    };
    const error = new Error('boom');
    failedHandler(fakeJob, error);

    expect(handleJobFailure).toHaveBeenCalledTimes(1);
    const [job, err, sinks, opts] = (handleJobFailure as jest.Mock).mock.calls[0] as [
      unknown,
      Error,
      { log: (event: string, meta: Record<string, unknown>) => void; capture: unknown },
      { queueName: string; treatNoAttemptsAsFinal: boolean; summarize: (data: unknown) => unknown },
    ];
    expect(job).toEqual({
      id: '1',
      data: { jobName: 'prune-sf' },
      attemptsMade: 1,
      opts: { attempts: 1 },
    });
    expect(err).toBe(error);
    expect(sinks.log).toBeInstanceOf(Function);
    expect(sinks.capture).toBe(captureExceptionWithContext);
    // sinks.log must proxy to logger.warn (kills BlockStatement / log identity mutants)
    sinks.log('proxied_event', { foo: 'bar' });
    expect(logger.warn).toHaveBeenCalledWith('proxied_event', { foo: 'bar' });
    expect(opts).toEqual(
      expect.objectContaining({
        queueName: 'prune-sf',
        treatNoAttemptsAsFinal: true,
      }),
    );
    // summarize falls back to cfg.name when data has no jobName
    expect(opts.summarize({})).toEqual({ jobName: 'prune-sf' });
    // summarize uses data.jobName when present
    expect(opts.summarize({ jobName: 'override' })).toEqual({ jobName: 'override' });
  });

  it('worker failed event passes null job when BullMQ does not provide one', async () => {
    const handle = registerScheduledJob(makeConfig({ name: 'prune-null' }));
    await handle.start();

    const failedHandler = (
      mockWorkerOn.mock.calls as [string, (...args: unknown[]) => void][]
    ).find(([event]) => event === 'failed')![1] as (job: unknown, err: Error) => void;
    failedHandler(undefined, new Error('no-job'));

    const [job] = (handleJobFailure as jest.Mock).mock.calls[0] as [unknown];
    expect(job).toBeNull();
  });

  it('worker error event sends to Sentry with worker_error kind', async () => {
    const handle = registerScheduledJob(makeConfig({ name: 'prune-werr' }));
    await handle.start();

    const errorHandler = (mockWorkerOn.mock.calls as [string, (...args: unknown[]) => void][]).find(
      ([event]) => event === 'error',
    )![1] as (err: Error) => void;
    const e = new Error('worker exploded');
    errorHandler(e);

    expect(captureExceptionWithContext).toHaveBeenCalledWith(e, {
      queue: 'prune-werr',
      kind: 'worker_error',
    });
  });

  it('close() removes scheduler, closes worker, and closes queue', async () => {
    const handle = registerScheduledJob(makeConfig({ name: 'prune-reviews' }));

    await handle.start();
    await handle.close();

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith('prune-reviews-scheduler');
    expect(mockWorkerClose).toHaveBeenCalledTimes(1);
    expect(mockQueueClose).toHaveBeenCalledTimes(1);
  });

  it('close() emits scheduled_job_stopped log with job name', async () => {
    const handle = registerScheduledJob(makeConfig({ name: 'prune-stop' }));

    await handle.start();
    await handle.close();

    expect(logger.info).toHaveBeenCalledWith('scheduled_job_stopped', { job: 'prune-stop' });
  });

  it('close() logs warn with <name>_scheduler_remove_failed when removeJobScheduler throws', async () => {
    mockRemoveJobScheduler.mockRejectedValueOnce(new Error('redis-rm'));
    const handle = registerScheduledJob(makeConfig({ name: 'prune-c1' }));

    await handle.start();
    await handle.close();

    expect(logger.warn).toHaveBeenCalledWith('prune-c1_scheduler_remove_failed', {
      error: 'redis-rm',
    });
    // queue.close still attempted
    expect(mockQueueClose).toHaveBeenCalledTimes(1);
  });

  it('close() logs warn with <name>_worker_close_failed when worker.close throws', async () => {
    mockWorkerClose.mockRejectedValueOnce(new Error('worker-bye'));
    const handle = registerScheduledJob(makeConfig({ name: 'prune-c2' }));

    await handle.start();
    await handle.close();

    expect(logger.warn).toHaveBeenCalledWith('prune-c2_worker_close_failed', {
      error: 'worker-bye',
    });
  });

  it('close() logs warn with <name>_queue_close_failed when queue.close throws', async () => {
    mockQueueClose.mockRejectedValueOnce(new Error('queue-bye'));
    const handle = registerScheduledJob(makeConfig({ name: 'prune-c3' }));

    await handle.start();
    await handle.close();

    expect(logger.warn).toHaveBeenCalledWith('prune-c3_queue_close_failed', {
      error: 'queue-bye',
    });
  });

  it('close() is safe to call before start() and skips worker.close() (no worker spawned)', async () => {
    const handle = registerScheduledJob(makeConfig({ name: 'prune-noworker' }));

    await expect(handle.close()).resolves.toBeUndefined();

    // Worker was never spawned, so worker.close() must NOT be invoked and
    // safeClose must NOT log the worker_close_failed warn (kills the
    // `if (worker !== undefined)` → `if (true)` mutant).
    expect(mockWorkerClose).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalledWith(
      'prune-noworker_worker_close_failed',
      expect.any(Object),
    );
  });
});
