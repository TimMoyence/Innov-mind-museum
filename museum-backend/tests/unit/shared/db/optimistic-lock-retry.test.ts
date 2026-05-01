import { withOptimisticLockRetry } from '@shared/db/optimistic-lock-retry';

class FakeOptimisticLockError extends Error {
  constructor() {
    super('row was updated or deleted by another transaction');
    this.name = 'OptimisticLockVersionMismatchError';
  }
}

describe('withOptimisticLockRetry', () => {
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
});
