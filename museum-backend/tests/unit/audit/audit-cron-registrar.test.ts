import { Worker } from 'bullmq';

import {
  AUDIT_IP_ANONYMIZE_SCHEDULER_ID,
  DEFAULT_AUDIT_IP_CRON,
  registerAuditCron,
} from '@shared/audit/audit-cron.registrar';
import { runAuditIpAnonymizer } from '@shared/audit/audit-ip-anonymizer.job';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { handleJobFailure } from '@shared/queue/job-failure.handler';

import type { ConnectionOptions, Job, Queue } from 'bullmq';
import type { DataSource } from 'typeorm';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: jest.fn(),
}));

jest.mock('@shared/queue/job-failure.handler', () => ({
  handleJobFailure: jest.fn(),
}));

jest.mock('@shared/audit/audit-ip-anonymizer.job', () => ({
  runAuditIpAnonymizer: jest.fn(),
}));

interface CapturedWorker {
  name: string;
  callback: (job?: unknown) => Promise<unknown>;
  options: { connection: ConnectionOptions; concurrency: number };
  onSpy: jest.Mock;
}

let capturedWorker: CapturedWorker | undefined;
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Worker: jest
    .fn()
    .mockImplementation(
      (
        name: string,
        callback: (job?: unknown) => Promise<unknown>,
        options: { connection: ConnectionOptions; concurrency: number },
      ) => {
        const onSpy = jest.fn();
        capturedWorker = { name, callback, options, onSpy };
        return {
          on: onSpy,
          close: mockWorkerClose,
        };
      },
    ),
}));

interface QueueMock {
  name: string;
  upsertJobScheduler: jest.Mock;
  removeJobScheduler: jest.Mock;
}

const CONNECTION: ConnectionOptions = { host: 'localhost', port: 6379 };

const makeQueueMock = (overrides: Partial<QueueMock> = {}): QueueMock => ({
  name: 'audit-queue',
  upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  removeJobScheduler: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const asQueue = (q: QueueMock): Queue => q as unknown as Queue;

const FAKE_DATA_SOURCE = {} as unknown as DataSource;

describe('audit-cron.registrar / constants', () => {
  it('exports AUDIT_IP_ANONYMIZE_SCHEDULER_ID with the exact "audit-ip-anonymize" id (kills StringLiteral L13)', () => {
    expect(AUDIT_IP_ANONYMIZE_SCHEDULER_ID).toBe('audit-ip-anonymize');
    expect(AUDIT_IP_ANONYMIZE_SCHEDULER_ID).not.toBe('');
  });

  it('exports DEFAULT_AUDIT_IP_CRON as the "0 3 * * *" daily 03:00 UTC pattern (kills StringLiteral L45)', () => {
    expect(DEFAULT_AUDIT_IP_CRON).toBe('0 3 * * *');
    expect(DEFAULT_AUDIT_IP_CRON).not.toBe('');
  });
});

describe('registerAuditCron — happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorker = undefined;
    mockWorkerClose.mockResolvedValue(undefined);
    (runAuditIpAnonymizer as jest.Mock).mockResolvedValue({ anonymized: 0 });
  });

  it('uses DEFAULT_AUDIT_IP_CRON when config.cron is omitted (kills L78 LogicalOperator + L83 ObjectLiteral)', async () => {
    const queue = makeQueueMock();
    await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, { connection: CONNECTION });

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'audit-ip-anonymize',
      { pattern: '0 3 * * *' },
      {
        name: 'audit-ip-anonymize',
        data: {},
        opts: { removeOnComplete: 50, removeOnFail: 100 },
      },
    );
  });

  it('uses the overridden cron pattern when supplied (kills L78 LogicalOperator → `&&` mutant)', async () => {
    const queue = makeQueueMock();
    await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, {
      connection: CONNECTION,
      cron: '*/15 * * * *',
    });

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'audit-ip-anonymize',
      { pattern: '*/15 * * * *' },
      expect.any(Object),
    );
    const [, scheduleSpec] = queue.upsertJobScheduler.mock.calls[0] as [
      string,
      { pattern: string },
      unknown,
    ];
    expect(scheduleSpec.pattern).not.toBe(DEFAULT_AUDIT_IP_CRON);
  });

  it('emits audit_cron_registered info log with cron + schedulerId (kills L90 StringLiteral + ObjectLiteral)', async () => {
    const queue = makeQueueMock();
    await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, {
      connection: CONNECTION,
      cron: '0 4 * * *',
    });

    expect(logger.info).toHaveBeenCalledWith('audit_cron_registered', {
      cron: '0 4 * * *',
      schedulerId: 'audit-ip-anonymize',
    });
    const infoKeys = (logger.info as jest.Mock).mock.calls.map((c) => c[0]);
    expect(infoKeys).toContain('audit_cron_registered');
    expect(infoKeys).not.toContain('');
  });

  it('constructs the Worker with queue.name, concurrency=1, and the configured connection (kills L113 ObjectLiteral)', async () => {
    const queue = makeQueueMock({ name: 'aq-x' });
    await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, { connection: CONNECTION });

    expect(Worker).toHaveBeenCalledTimes(1);
    expect(Worker).toHaveBeenCalledWith('aq-x', expect.any(Function), {
      connection: CONNECTION,
      concurrency: 1,
    });
    expect(capturedWorker).toBeDefined();
    expect(capturedWorker?.options).toEqual({ connection: CONNECTION, concurrency: 1 });
  });

  it('wires the worker `failed` and `error` event handlers (kills L116 StringLiteral; TD-BMQ-01)', async () => {
    const queue = makeQueueMock();
    await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, { connection: CONNECTION });

    expect(capturedWorker?.onSpy).toHaveBeenCalledTimes(2);
    const events = capturedWorker!.onSpy.mock.calls.map((c) => c[0] as string);
    expect(events).toContain('failed');
    expect(events).toContain('error');
    capturedWorker!.onSpy.mock.calls.forEach((c) => {
      expect(c[1]).toBeInstanceOf(Function);
    });
  });
});

describe('registerAuditCron — worker tick callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorker = undefined;
    mockWorkerClose.mockResolvedValue(undefined);
  });

  it('invokes runAuditIpAnonymizer with the data source then emits audit_cron_tick_completed (kills L109-111)', async () => {
    (runAuditIpAnonymizer as jest.Mock).mockResolvedValue({ anonymized: 7 });
    const queue = makeQueueMock();
    await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, { connection: CONNECTION });

    expect(capturedWorker).toBeDefined();
    await capturedWorker!.callback();

    expect(runAuditIpAnonymizer).toHaveBeenCalledTimes(1);
    expect(runAuditIpAnonymizer).toHaveBeenCalledWith(FAKE_DATA_SOURCE);
    expect(logger.info).toHaveBeenCalledWith('audit_cron_tick_completed', { anonymized: 7 });
    const infoKeys = (logger.info as jest.Mock).mock.calls.map((c) => c[0]);
    expect(infoKeys).toContain('audit_cron_tick_completed');
    expect(infoKeys).not.toContain('');
  });

  it('propagates rejections from runAuditIpAnonymizer so BullMQ marks the tick failed', async () => {
    const boom = new Error('anonymizer exploded');
    (runAuditIpAnonymizer as jest.Mock).mockRejectedValue(boom);
    const queue = makeQueueMock();
    await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, { connection: CONNECTION });

    await expect(capturedWorker!.callback()).rejects.toBe(boom);
    const completedCalls = (logger.info as jest.Mock).mock.calls.filter(
      ([key]) => key === 'audit_cron_tick_completed',
    );
    expect(completedCalls).toHaveLength(0);
  });
});

describe('registerAuditCron — onAuditCronJobFailed', () => {
  const makeFakeJob = (
    overrides: Partial<{
      id: string;
      attemptsMade: number;
      opts: { attempts?: number };
    }> = {},
  ): Job =>
    ({
      id: 'job-abc',
      attemptsMade: 3,
      opts: { attempts: 0 },
      ...overrides,
    }) as unknown as Job;

  const getFailedHandler = async (): Promise<(job: Job | undefined, err: Error) => void> => {
    const queue = makeQueueMock();
    await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, { connection: CONNECTION });
    const entry = (capturedWorker!.onSpy.mock.calls as [string, unknown][]).find(
      ([event]) => event === 'failed',
    );
    expect(entry).toBeDefined();
    return entry![1] as (job: Job | undefined, err: Error) => void;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorker = undefined;
    (runAuditIpAnonymizer as jest.Mock).mockResolvedValue({ anonymized: 0 });
  });

  it('builds the FailedJobSnapshot from job.id, empty data, attemptsMade, opts.attempts (kills L19/L23 ObjectLiteral)', async () => {
    const handler = await getFailedHandler();
    const fakeJob = makeFakeJob({ id: 'job-1', attemptsMade: 2, opts: { attempts: 5 } });
    const err = new Error('cron-boom');

    handler(fakeJob, err);

    expect(handleJobFailure).toHaveBeenCalledTimes(1);
    const [snapshot, passedErr] = (handleJobFailure as jest.Mock).mock.calls[0] as [
      unknown,
      Error,
      unknown,
      unknown,
    ];
    expect(snapshot).toEqual({
      id: 'job-1',
      data: {},
      attemptsMade: 2,
      opts: { attempts: 5 },
    });
    expect(passedErr).toBe(err);
  });

  it('passes null snapshot when BullMQ omits the job (kills BlockStatement L16-42 branch coverage)', async () => {
    const handler = await getFailedHandler();
    handler(undefined, new Error('no-job'));

    const [snapshot] = (handleJobFailure as jest.Mock).mock.calls[0] as [unknown];
    expect(snapshot).toBeNull();
  });

  it('wires sinks.log to logger.warn and sinks.capture to captureExceptionWithContext (kills L27/L28 ObjectLiteral + BlockStatement)', async () => {
    const handler = await getFailedHandler();
    handler(makeFakeJob(), new Error('x'));

    const [, , sinks] = (handleJobFailure as jest.Mock).mock.calls[0] as [
      unknown,
      Error,
      { log: (event: string, meta: Record<string, unknown>) => void; capture: unknown },
      unknown,
    ];
    expect(sinks.log).toBeInstanceOf(Function);
    expect(sinks.capture).toBe(captureExceptionWithContext);

    sinks.log('proxied_event', { foo: 'bar' });
    expect(logger.warn).toHaveBeenCalledWith('proxied_event', { foo: 'bar' });
  });

  it('forwards queueName + summarize:()=>({}) + treatNoAttemptsAsFinal:true (kills L33 ObjectLiteral + L37 ArrowFunction + L39 BooleanLiteral)', async () => {
    const handler = await getFailedHandler();
    handler(makeFakeJob(), new Error('x'));

    const [, , , opts] = (handleJobFailure as jest.Mock).mock.calls[0] as [
      unknown,
      Error,
      unknown,
      {
        queueName: string;
        summarize: (data: Record<string, unknown>) => Record<string, unknown>;
        treatNoAttemptsAsFinal: boolean;
      },
    ];
    expect(opts.queueName).toBe(AUDIT_IP_ANONYMIZE_SCHEDULER_ID);
    expect(opts.treatNoAttemptsAsFinal).toBe(true);
    expect(opts.treatNoAttemptsAsFinal).not.toBe(false);

    expect(opts.summarize).toBeInstanceOf(Function);
    expect(opts.summarize({})).toEqual({});
    expect(opts.summarize({ foo: 'bar', n: 1 })).toEqual({});
    expect(opts.summarize({})).not.toBeUndefined();
  });
});

describe('registerAuditCron — register failure path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorker = undefined;
    (runAuditIpAnonymizer as jest.Mock).mockResolvedValue({ anonymized: 0 });
  });

  it('logs audit_cron_register_failed with err.message and pages Sentry (kills L94/L95/L98 mutants)', async () => {
    const queue = makeQueueMock({
      upsertJobScheduler: jest.fn().mockRejectedValue(new Error('redis down')),
    });

    const handle = await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, {
      connection: CONNECTION,
    });

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('audit_cron_register_failed', {
      error: 'redis down',
    });
    const errorKeys = (logger.error as jest.Mock).mock.calls.map((c) => c[0]);
    expect(errorKeys).toContain('audit_cron_register_failed');
    expect(errorKeys).not.toContain('');

    expect(captureExceptionWithContext).toHaveBeenCalledTimes(1);
    const [capturedErr, sentryCtx] = (captureExceptionWithContext as jest.Mock).mock.calls[0] as [
      Error,
      Record<string, string>,
    ];
    expect(capturedErr).toBeInstanceOf(Error);
    expect(capturedErr.message).toBe('redis down');
    expect(sentryCtx).toEqual({ schedulerId: 'audit-ip-anonymize' });

    expect(Worker).not.toHaveBeenCalled();
    expect(capturedWorker).toBeUndefined();

    await expect(handle.stop()).resolves.toBeUndefined();
    expect(queue.removeJobScheduler).not.toHaveBeenCalled();
  });

  it('coerces non-Error rejections to a string error message (kills `err instanceof Error ? … : String(err)` branch)', async () => {
    const queue = makeQueueMock({
      upsertJobScheduler: jest.fn().mockRejectedValue('plain string failure'),
    });

    const handle = await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, {
      connection: CONNECTION,
    });

    expect(logger.error).toHaveBeenCalledWith('audit_cron_register_failed', {
      error: 'plain string failure',
    });
    expect(captureExceptionWithContext).toHaveBeenCalledTimes(1);
    const [wrapped] = (captureExceptionWithContext as jest.Mock).mock.calls[0] as [Error];
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toBe('plain string failure');

    await expect(handle.stop()).resolves.toBeUndefined();
  });
});

describe('registerAuditCron — stop() handle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorker = undefined;
    mockWorkerClose.mockResolvedValue(undefined);
    (runAuditIpAnonymizer as jest.Mock).mockResolvedValue({ anonymized: 0 });
  });

  it('removes the scheduler then closes the worker on the happy path (kills L120/L127 BlockStatement)', async () => {
    const queue = makeQueueMock();
    const handle = await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, {
      connection: CONNECTION,
    });

    await handle.stop();

    expect(queue.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith('audit-ip-anonymize');
    expect(mockWorkerClose).toHaveBeenCalledTimes(1);
  });

  it('logs audit_cron_remove_failed and STILL closes the worker when removeJobScheduler rejects (kills L122/L123 mutants)', async () => {
    const queue = makeQueueMock({
      removeJobScheduler: jest.fn().mockRejectedValue(new Error('rm bust')),
    });
    const handle = await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, {
      connection: CONNECTION,
    });

    await expect(handle.stop()).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith('audit_cron_remove_failed', {
      error: 'rm bust',
    });
    const warnKeys = (logger.warn as jest.Mock).mock.calls.map((c) => c[0]);
    expect(warnKeys).toContain('audit_cron_remove_failed');
    expect(warnKeys).not.toContain('');

    expect(mockWorkerClose).toHaveBeenCalledTimes(1);
  });

  it('coerces non-Error remove rejection to string (kills `err instanceof Error ? … : String(err)` branch in stop)', async () => {
    const queue = makeQueueMock({
      removeJobScheduler: jest.fn().mockRejectedValue(42),
    });
    const handle = await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, {
      connection: CONNECTION,
    });

    await handle.stop();

    expect(logger.warn).toHaveBeenCalledWith('audit_cron_remove_failed', { error: '42' });
  });

  it('logs audit_cron_worker_close_failed when worker.close rejects (kills L129/L130 mutants)', async () => {
    mockWorkerClose.mockRejectedValueOnce(new Error('worker-bye'));
    const queue = makeQueueMock();
    const handle = await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, {
      connection: CONNECTION,
    });

    await expect(handle.stop()).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith('audit_cron_worker_close_failed', {
      error: 'worker-bye',
    });
    const warnKeys = (logger.warn as jest.Mock).mock.calls.map((c) => c[0]);
    expect(warnKeys).toContain('audit_cron_worker_close_failed');
    expect(warnKeys).not.toContain('');
  });

  it('coerces non-Error worker.close rejection to string', async () => {
    mockWorkerClose.mockRejectedValueOnce('worker string err');
    const queue = makeQueueMock();
    const handle = await registerAuditCron(asQueue(queue), FAKE_DATA_SOURCE, {
      connection: CONNECTION,
    });

    await handle.stop();

    expect(logger.warn).toHaveBeenCalledWith('audit_cron_worker_close_failed', {
      error: 'worker string err',
    });
  });
});
