import { withDbRetry, isTransient } from '@shared/db/with-retry';

// Mock the logger to avoid console noise and verify log calls
jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock timers so sleep() resolves instantly
jest.useFakeTimers();

/** Helper: create an Error with a PG-style `code` property. */
const pgError = (code: string, message = 'pg error'): Error => {
  const err = new Error(message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (err as any).code = code;
  return err;
};

/** Helper: create an Error with a Node.js-style `code` on the name. */
const nodeError = (name: string, message = 'node error'): Error => {
  const err = new Error(message);
  err.name = name;
  return err;
};

/** Helper: create an Error with code as a property (ECONNREFUSED style). */
const codeError = (code: string, message = 'code error'): Error => {
  const err = new Error(message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (err as any).code = code;
  return err;
};

// ---------------------------------------------------------------------------
// isTransient
// ---------------------------------------------------------------------------

describe('isTransient', () => {
  it('returns false for non-Error values', () => {
    expect(isTransient('string')).toBe(false);
    expect(isTransient(42)).toBe(false);
    expect(isTransient(null)).toBe(false);
  });

  it('returns true for PG connection_failure (08006)', () => {
    expect(isTransient(pgError('08006'))).toBe(true);
  });

  it('returns true for PG sqlclient_unable_to_establish (08001)', () => {
    expect(isTransient(pgError('08001'))).toBe(true);
  });

  it('returns true for PG admin_shutdown (57P01)', () => {
    expect(isTransient(pgError('57P01'))).toBe(true);
  });

  it('returns true for PG serialization_failure (40001)', () => {
    expect(isTransient(pgError('40001'))).toBe(true);
  });

  it('returns true for PG deadlock_detected (40P01)', () => {
    expect(isTransient(pgError('40P01'))).toBe(true);
  });

  it('returns true for ECONNRESET by name', () => {
    expect(isTransient(nodeError('ECONNRESET'))).toBe(true);
  });

  it('returns true for ECONNREFUSED by code property', () => {
    expect(isTransient(codeError('ECONNREFUSED'))).toBe(true);
  });

  it('returns true for ETIMEDOUT by name', () => {
    expect(isTransient(nodeError('ETIMEDOUT'))).toBe(true);
  });

  it('returns false for a regular Error', () => {
    expect(isTransient(new Error('something else'))).toBe(false);
  });

  it('returns false for unknown PG codes', () => {
    expect(isTransient(pgError('23505'))).toBe(false); // unique_violation
  });
});

// ---------------------------------------------------------------------------
// withDbRetry
// ---------------------------------------------------------------------------

describe('withDbRetry', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('returns immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    const result = await withDbRetry(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws non-transient errors immediately without retrying', async () => {
    const err = new Error('unique_violation');
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withDbRetry(fn)).rejects.toThrow('unique_violation');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors up to maxRetries', async () => {
    const transient = pgError('40P01', 'deadlock');
    const fn = jest.fn().mockRejectedValue(transient);

    // Run in microtask so fake timers can advance
    const promise = withDbRetry(fn, { maxRetries: 2, baseDelayMs: 10 });

    // Advance through the retry delays
    await jest.advanceTimersByTimeAsync(10); // attempt 0 delay: 10 * 2^0 = 10
    await jest.advanceTimersByTimeAsync(20); // attempt 1 delay: 10 * 2^1 = 20

    await expect(promise).rejects.toThrow('deadlock');
    // 1 initial + 2 retries = 3
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('succeeds after transient failures', async () => {
    const transient = pgError('08006', 'connection lost');
    const fn = jest
      .fn()
      .mockRejectedValueOnce(transient)
      .mockRejectedValueOnce(transient)
      .mockResolvedValue('recovered');

    const promise = withDbRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    await jest.advanceTimersByTimeAsync(10); // retry 1
    await jest.advanceTimersByTimeAsync(20); // retry 2

    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects custom context in log messages', async () => {
    const { logger } = require('@shared/logger/logger');
    const transient = pgError('40001', 'serialization');
    const fn = jest.fn().mockRejectedValueOnce(transient).mockResolvedValue('ok');

    const promise = withDbRetry(fn, { maxRetries: 2, baseDelayMs: 50, context: 'my_query' });
    await jest.advanceTimersByTimeAsync(50);
    await promise;

    expect(logger.warn).toHaveBeenCalledWith(
      'db_retry_attempt',
      expect.objectContaining({ context: 'my_query', attempt: 1 }),
    );
  });
});
