import { runWithRetry, isRetryableError, DEFAULT_BACKOFF_MS } from '@/shared/lib/retry';
import { createAppError } from '@/shared/types/AppError';

const instantSleep = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  instantSleep.mockClear();
});

describe('isRetryableError', () => {
  it('classifies Network / Timeout / RateLimited AppError kinds as retryable', () => {
    expect(isRetryableError(createAppError({ kind: 'Network', message: 'x' }))).toBe(true);
    expect(isRetryableError(createAppError({ kind: 'Timeout', message: 'x' }))).toBe(true);
    expect(isRetryableError(createAppError({ kind: 'RateLimited', message: 'x' }))).toBe(true);
  });

  it('classifies 5xx / 408 / 429 statuses as retryable regardless of kind', () => {
    expect(isRetryableError(createAppError({ kind: 'Unknown', message: 'x', status: 502 }))).toBe(
      true,
    );
    expect(isRetryableError(createAppError({ kind: 'Unknown', message: 'x', status: 408 }))).toBe(
      true,
    );
    expect(isRetryableError(createAppError({ kind: 'Unknown', message: 'x', status: 429 }))).toBe(
      true,
    );
  });

  it('classifies Validation / Unauthorized / Forbidden / NotFound / Contract as fatal', () => {
    expect(isRetryableError(createAppError({ kind: 'Validation', message: 'x' }))).toBe(false);
    expect(isRetryableError(createAppError({ kind: 'Unauthorized', message: 'x' }))).toBe(false);
    expect(isRetryableError(createAppError({ kind: 'Forbidden', message: 'x' }))).toBe(false);
    expect(isRetryableError(createAppError({ kind: 'NotFound', message: 'x' }))).toBe(false);
    expect(isRetryableError(createAppError({ kind: 'Contract', message: 'x' }))).toBe(false);
  });

  it('defaults unstructured Errors to retryable (typically offline / fetch)', () => {
    expect(isRetryableError(new Error('boom'))).toBe(true);
    expect(isRetryableError('random string')).toBe(true);
  });
});

describe('runWithRetry', () => {
  it('returns the value on first success without sleeping', async () => {
    const op = jest.fn().mockResolvedValue('ok');

    const result = await runWithRetry(op, { sleep: instantSleep });

    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
    expect(instantSleep).not.toHaveBeenCalled();
  });

  it('retries retryable failures up to `attempts` and honours the backoff schedule', async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(createAppError({ kind: 'Network', message: '1' }))
      .mockRejectedValueOnce(createAppError({ kind: 'Timeout', message: '2' }))
      .mockResolvedValue('recovered');

    const result = await runWithRetry(op, { sleep: instantSleep });

    expect(result).toBe('recovered');
    expect(op).toHaveBeenCalledTimes(3);
    expect(instantSleep).toHaveBeenCalledTimes(2);
    expect(instantSleep).toHaveBeenNthCalledWith(1, DEFAULT_BACKOFF_MS[0]);
    expect(instantSleep).toHaveBeenNthCalledWith(2, DEFAULT_BACKOFF_MS[1]);
  });

  it('stops immediately on a fatal error without sleeping', async () => {
    const fatal = createAppError({ kind: 'Validation', message: 'bad' });
    const op = jest.fn().mockRejectedValue(fatal);

    await expect(runWithRetry(op, { sleep: instantSleep })).rejects.toBe(fatal);

    expect(op).toHaveBeenCalledTimes(1);
    expect(instantSleep).not.toHaveBeenCalled();
  });

  it('throws the last error when retries are exhausted', async () => {
    const op = jest
      .fn()
      .mockRejectedValue(createAppError({ kind: 'Network', message: 'never comes back' }));

    await expect(runWithRetry(op, { sleep: instantSleep })).rejects.toMatchObject({
      kind: 'Network',
    });

    // 1 initial attempt + 3 retries = 4 total calls with default backoff length.
    expect(op).toHaveBeenCalledTimes(DEFAULT_BACKOFF_MS.length + 1);
    expect(instantSleep).toHaveBeenCalledTimes(DEFAULT_BACKOFF_MS.length);
  });

  it('respects a custom backoff schedule and custom attempts count', async () => {
    const op = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(runWithRetry(op, { backoff: [1, 2], sleep: instantSleep })).rejects.toThrow(
      'boom',
    );

    expect(op).toHaveBeenCalledTimes(3);
    expect(instantSleep).toHaveBeenNthCalledWith(1, 1);
    expect(instantSleep).toHaveBeenNthCalledWith(2, 2);
  });

  it('exits early when the AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const op = jest.fn();

    await expect(
      runWithRetry(op, { sleep: instantSleep, signal: controller.signal }),
    ).rejects.toBeUndefined();

    expect(op).not.toHaveBeenCalled();
  });
});
