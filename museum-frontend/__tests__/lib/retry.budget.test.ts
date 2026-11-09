import { runWithRetry, DEFAULT_BACKOFF_MS, isRetryableError } from '@/shared/lib/retry';
import { createAppError } from '@/shared/types/AppError';
import { FakeClock } from '@/shared/testing/withNetworkSim';

describe('M5 — runWithRetry backoff budget', () => {
  it('exposes the ratified backoff schedule [500, 2000, 8000]', () => {
    expect(DEFAULT_BACKOFF_MS).toEqual([500, 2000, 8000]);
  });

  it('waits the exact backoff schedule between retries on transient failures', async () => {
    const clock = new FakeClock();
    const waited: number[] = [];
    const sleep = (ms: number): Promise<void> => {
      waited.push(ms);
      return clock.setTimeout(() => undefined, ms);
    };

    const op = jest
      .fn<Promise<string>, []>()
      .mockRejectedValue(createAppError({ kind: 'Network', message: 'down' }));

    const run = runWithRetry(op, { sleep }).catch((e: unknown) => e);
    await clock.runAll();
    await run;

    expect(op).toHaveBeenCalledTimes(DEFAULT_BACKOFF_MS.length + 1);
    expect(waited).toEqual([...DEFAULT_BACKOFF_MS]);
  });

  it('caps total op calls at min(attempts, backoff.length + 1)', async () => {
    const clock = new FakeClock();
    const sleep = (ms: number): Promise<void> => clock.setTimeout(() => undefined, ms);

    const op = jest
      .fn<Promise<string>, []>()
      .mockRejectedValue(createAppError({ kind: 'Network', message: 'down' }));

    const run = runWithRetry(op, { sleep, attempts: 2 }).catch((e: unknown) => e);
    await clock.runAll();
    await run;

    expect(op).toHaveBeenCalledTimes(2);
  });

  it('retries a Timeout AppError (the >15000ms degraded-network mapping is retryable)', async () => {
    const clock = new FakeClock();
    const sleep = (ms: number): Promise<void> => clock.setTimeout(() => undefined, ms);

    const timeout = createAppError({ kind: 'Timeout', message: 'exceeded 15000ms' });
    expect(isRetryableError(timeout)).toBe(true);

    const op = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce('recovered');

    const run = runWithRetry(op, { sleep });
    await clock.runAll();

    await expect(run).resolves.toBe('recovered');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('does not retry a fatal (non-retryable) error', async () => {
    const op = jest
      .fn<Promise<string>, []>()
      .mockRejectedValue(createAppError({ kind: 'Validation', message: 'bad', status: 400 }));

    await expect(runWithRetry(op, { sleep: async () => undefined })).rejects.toMatchObject({
      kind: 'Validation',
    });
    expect(op).toHaveBeenCalledTimes(1);
  });
});
