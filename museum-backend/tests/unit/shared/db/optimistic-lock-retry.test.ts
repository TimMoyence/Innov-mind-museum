import { randomSource } from '@shared/utils/random';
import { withOptimisticLockRetry } from '@shared/db/optimistic-lock-retry';
import { logger } from '@shared/logger/logger';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

class FakeOptimisticLockError extends Error {
  constructor() {
    super('row was updated or deleted by another transaction');
    this.name = 'OptimisticLockVersionMismatchError';
  }
}

describe('withOptimisticLockRetry', () => {
  beforeEach(() => {
    (logger.warn as jest.Mock).mockClear();
  });
  it('returns the result on first attempt success', async () => {
    const mutation = jest.fn().mockResolvedValue('ok');
    const refetch = jest.fn();
    const result = await withOptimisticLockRetry({
      mutation,
      refetch,
      maxAttempts: 3,
      baseDelayMs: 1,
    });
    expect(result).toBe('ok');
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('retries on optimistic-lock error and succeeds on refetch', async () => {
    const mutation = jest
      .fn()
      .mockRejectedValueOnce(new FakeOptimisticLockError())
      .mockResolvedValueOnce('ok');
    const refetch = jest.fn().mockResolvedValue(undefined);
    const result = await withOptimisticLockRetry({
      mutation,
      refetch,
      maxAttempts: 3,
      baseDelayMs: 1,
    });
    expect(result).toBe('ok');
    expect(mutation).toHaveBeenCalledTimes(2);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('throws after maxAttempts exhausted', async () => {
    const mutation = jest.fn().mockRejectedValue(new FakeOptimisticLockError());
    const refetch = jest.fn().mockResolvedValue(undefined);
    await expect(
      withOptimisticLockRetry({
        mutation,
        refetch,
        maxAttempts: 3,
        baseDelayMs: 1,
      }),
    ).rejects.toMatchObject({ name: 'OptimisticLockVersionMismatchError' });
    expect(mutation).toHaveBeenCalledTimes(3);
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-optimistic errors immediately', async () => {
    const mutation = jest.fn().mockRejectedValue(new Error('unrelated'));
    const refetch = jest.fn();
    await expect(
      withOptimisticLockRetry({
        mutation,
        refetch,
        maxAttempts: 3,
        baseDelayMs: 1,
      }),
    ).rejects.toThrow('unrelated');
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('logs optimistic_lock_retry with attempt + maxAttempts + context meta on each retry', async () => {
    const mutation = jest
      .fn()
      .mockRejectedValueOnce(new FakeOptimisticLockError())
      .mockResolvedValueOnce('ok');
    await withOptimisticLockRetry({
      mutation,
      refetch: jest.fn().mockResolvedValue(undefined),
      maxAttempts: 3,
      baseDelayMs: 1,
      context: 'museum.update',
    });
    expect(logger.warn).toHaveBeenCalledWith('optimistic_lock_retry', {
      attempt: 1,
      maxAttempts: 3,
      context: 'museum.update',
    });
  });

  describe('backoff delay formula', () => {
    let setTimeoutSpy: jest.SpyInstance;
    let mathRandomSpy: jest.SpyInstance;

    beforeEach(() => {
      setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
        cb: () => void,
      ): NodeJS.Timeout => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);
      mathRandomSpy = jest.spyOn(randomSource, 'unit').mockReturnValue(0.5);
    });

    afterEach(() => {
      setTimeoutSpy.mockRestore();
      mathRandomSpy.mockRestore();
    });

    it('uses base * 2^(attempt-1) + floor(random * max(1, base)) for the total delay', async () => {
      const mutation = jest
        .fn()
        .mockRejectedValueOnce(new FakeOptimisticLockError())
        .mockRejectedValueOnce(new FakeOptimisticLockError())
        .mockResolvedValueOnce('ok');
      await withOptimisticLockRetry({
        mutation,
        refetch: jest.fn().mockResolvedValue(undefined),
        maxAttempts: 3,
        baseDelayMs: 10,
      });

      const delayCalls = setTimeoutSpy.mock.calls.map(([, delay]) => delay as number);
      expect(delayCalls).toEqual([15, 25]);
    });

    it('falls back to DEFAULT_BASE_DELAY_MS=50 when baseDelayMs is omitted (kills `??` -> `&&` mutant)', async () => {
      const mutation = jest
        .fn()
        .mockRejectedValueOnce(new FakeOptimisticLockError())
        .mockResolvedValueOnce('ok');
      await withOptimisticLockRetry({
        mutation,
        refetch: jest.fn().mockResolvedValue(undefined),
        maxAttempts: 2,
      });

      const delayCall = setTimeoutSpy.mock.calls[0]?.[1] as number;
      expect(delayCall).toBe(75);
    });
  });
});
