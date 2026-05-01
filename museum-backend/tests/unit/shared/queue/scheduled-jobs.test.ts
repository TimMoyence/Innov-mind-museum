import { registerScheduledJob } from '@shared/queue/scheduled-jobs';

import type { ScheduledJobConfig, ScheduledJobResult } from '@shared/queue/scheduled-jobs';

// ─── BullMQ mock ──────────────────────────────────────────────────────────────
//
// We test the wrapper contract without a Redis dependency. BullMQ is fully
// mocked so the assertions focus on:
//   1. The public handle shape (start / close functions).
//   2. The scheduler being registered on start().
//   3. The worker + queue being released on close().
//

const mockUpsertJobScheduler = jest.fn().mockResolvedValue(undefined);
const mockRemoveJobScheduler = jest.fn().mockResolvedValue(undefined);
const mockQueueClose = jest.fn().mockResolvedValue(undefined);

const mockWorkerOn = jest.fn();
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);

// Capture the processor so tests can exercise it directly.
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
  });

  it('returns a handle with start and close functions', () => {
    const handle = registerScheduledJob(makeConfig());

    expect(handle.start).toBeInstanceOf(Function);
    expect(handle.close).toBeInstanceOf(Function);
  });

  it('start() registers the cron scheduler via upsertJobScheduler', async () => {
    const handle = registerScheduledJob(
      makeConfig({ cronPattern: '15 3 * * *', name: 'prune-tickets' }),
    );

    await handle.start();

    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(1);
    const [schedulerId, repeatOpts] = mockUpsertJobScheduler.mock.calls[0] as [
      string,
      { pattern: string },
    ];
    expect(schedulerId).toBe('prune-tickets-scheduler');
    expect(repeatOpts.pattern).toBe('15 3 * * *');
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

  it('worker processor invokes handler and returns result', async () => {
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

  it('close() removes scheduler, closes worker, and closes queue', async () => {
    const handle = registerScheduledJob(makeConfig({ name: 'prune-reviews' }));

    await handle.start();
    await handle.close();

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith('prune-reviews-scheduler');
    expect(mockWorkerClose).toHaveBeenCalledTimes(1);
    expect(mockQueueClose).toHaveBeenCalledTimes(1);
  });

  it('close() is safe to call before start() (no worker spawned)', async () => {
    const handle = registerScheduledJob(makeConfig());

    // close without start — should not throw
    await expect(handle.close()).resolves.toBeUndefined();
  });
});
