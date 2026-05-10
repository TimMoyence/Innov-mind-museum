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

  // Logger event name + payload (kills L51 StringLiteral + ObjectLiteral
  // mutants on logger.warn(...)).
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

  // Backoff delay formula uses Math.random() * Math.max(1, baseDelayMs) for
  // jitter and base * 2^(attempt-1) + jitter for the total delay.
  // Mocking Math.random + setTimeout lets us assert the exact delay value
  // and kill the L58/L59 ArithmeticOperator + MethodExpression mutants.
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
      mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
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

      // attempt 1 retry: 10 * 2^0 + floor(0.5 * max(1, 10)) = 10 + 5 = 15
      // attempt 2 retry: 10 * 2^1 + floor(0.5 * max(1, 10)) = 20 + 5 = 25
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
        // baseDelayMs intentionally omitted to exercise the `?? 50` default
      });

      // attempt 1 retry: 50 * 2^0 + floor(0.5 * max(1, 50)) = 50 + 25 = 75
      // (with `&&` mutant the delay would be NaN since undefined && 50 = undefined)
      const delayCall = setTimeoutSpy.mock.calls[0]?.[1] as number;
      expect(delayCall).toBe(75);
    });
  });
});
