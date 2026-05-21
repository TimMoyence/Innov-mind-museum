/**
 * RED (T4.1) — S3 orphan-purge cron registrar (B5, R10–R11).
 *
 * Mirrors the `chat-purge-cron.registrar` / `audit-cron.registrar` pattern:
 *   - `upsertJobScheduler` called with a STABLE scheduler id (idempotent reboot).
 *   - a worker tick invokes the injected `runS3OrphanPurge` stub.
 *   - registration error (`upsertJobScheduler` throws) → fail-open: a no-op
 *     `stop()` handle is returned and registration does NOT rethrow.
 *   - the worker has a mandatory `'error'` listener (lib-docs/bullmq, TD-BMQ-01).
 *
 * `bullmq` (Queue + Worker) and the orphan-purge job module are hoisted-mocked
 * so the registrar runs without Redis / Postgres / S3. The registrar MODULE
 * itself does not exist yet — it is loaded via a computed dynamic import that
 * tsc cannot statically resolve, so this file typechecks; at red runtime the
 * `import()` rejects (module not found) → every test fails. After green, the
 * mocked `bullmq` / job stub drive the assertions.
 */
import { Queue, Worker } from 'bullmq';

import { runS3OrphanPurge } from '@modules/chat/jobs/s3-orphan-purge.job';
import { loadRegisterS3OrphanPurgeCron } from 'tests/helpers/chat/orphan-cron.accessor';

import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: jest.fn(),
}));

jest.mock('@modules/chat/jobs/s3-orphan-purge.job', () => ({
  runS3OrphanPurge: jest.fn(),
}));

interface CapturedWorker {
  name: string;
  callback: (job?: unknown) => Promise<unknown>;
  onSpy: jest.Mock;
}

let capturedWorker: CapturedWorker | undefined;
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);
const mockUpsertJobScheduler = jest.fn().mockResolvedValue(undefined);
const mockRemoveJobScheduler = jest.fn().mockResolvedValue(undefined);
const mockQueueClose = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    upsertJobScheduler: mockUpsertJobScheduler,
    removeJobScheduler: mockRemoveJobScheduler,
    close: mockQueueClose,
  })),
  Worker: jest
    .fn()
    .mockImplementation((name: string, callback: (job?: unknown) => Promise<unknown>) => {
      const onSpy = jest.fn();
      capturedWorker = { name, callback, onSpy };
      return { on: onSpy, close: mockWorkerClose };
    }),
}));

const CONNECTION: ConnectionOptions = { host: 'localhost', port: 6379 };
const FAKE_DATA_SOURCE = {} as unknown as DataSource;

const baseConfig = () => ({ connection: CONNECTION, retentionDays: 180 });

describe('registerS3OrphanPurgeCron (B5 / R10–R11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorker = undefined;
    mockUpsertJobScheduler.mockResolvedValue(undefined);
    (runS3OrphanPurge as jest.Mock).mockResolvedValue({
      scanned: 0,
      deleted: 0,
      referenced: 0,
      tooFresh: 0,
      failed: 0,
    });
  });

  it('registers the scheduler with a stable, non-empty id (idempotent reboot)', async () => {
    const register = await loadRegisterS3OrphanPurgeCron();
    await register(FAKE_DATA_SOURCE, baseConfig());

    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(1);
    const [schedulerId, schedule] = mockUpsertJobScheduler.mock.calls[0] as [
      string,
      { pattern: string },
      unknown,
    ];
    expect(typeof schedulerId).toBe('string');
    expect(schedulerId.length).toBeGreaterThan(0);
    // Pattern is a cron expression (5 space-separated fields).
    expect(schedule.pattern.trim().split(/\s+/)).toHaveLength(5);
  });

  it('invokes the injected runS3OrphanPurge stub on a worker tick', async () => {
    const register = await loadRegisterS3OrphanPurgeCron();
    await register(FAKE_DATA_SOURCE, baseConfig());

    expect(capturedWorker).toBeDefined();
    await capturedWorker!.callback();

    expect(runS3OrphanPurge).toHaveBeenCalledTimes(1);
  });

  it('attaches a mandatory worker "error" listener (TD-BMQ-01)', async () => {
    const register = await loadRegisterS3OrphanPurgeCron();
    await register(FAKE_DATA_SOURCE, baseConfig());

    expect(capturedWorker).toBeDefined();
    const events = capturedWorker!.onSpy.mock.calls.map((c) => c[0] as string);
    expect(events).toContain('error');
    capturedWorker!.onSpy.mock.calls.forEach((c) => {
      expect(c[1]).toBeInstanceOf(Function);
    });
  });

  it('fails open on registration error — returns a no-op stop() and does NOT rethrow (R11)', async () => {
    mockUpsertJobScheduler.mockRejectedValueOnce(new Error('redis down'));
    const register = await loadRegisterS3OrphanPurgeCron();

    const handle = await register(FAKE_DATA_SOURCE, baseConfig());
    expect(handle).toBeDefined();
    expect(typeof handle.stop).toBe('function');
    await expect(handle.stop()).resolves.not.toThrow();

    // No worker should be spawned when registration failed.
    expect(Worker).not.toHaveBeenCalled();
  });

  it('constructs a dedicated Queue', async () => {
    const register = await loadRegisterS3OrphanPurgeCron();
    await register(FAKE_DATA_SOURCE, baseConfig());
    expect(Queue).toHaveBeenCalledTimes(1);
  });
});
