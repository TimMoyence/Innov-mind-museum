import { fireAndForget } from '@shared/utils/fire-and-forget';
import { logger } from '@shared/logger/logger';

jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

describe('fireAndForget', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not throw when promise resolves', () => {
    expect(() => {
      fireAndForget(Promise.resolve('ok'), 'test-ctx');
    }).not.toThrow();
  });

  it('logs a warning when promise rejects with an Error', async () => {
    const err = new Error('something broke');
    fireAndForget(Promise.reject(err), 'my-context');

    // Wait for microtask queue to flush
    await new Promise(process.nextTick);

    expect(logger.warn).toHaveBeenCalledWith('fire_and_forget_failed', {
      context: 'my-context',
      error: 'something broke',
    });
  });

  it('logs a warning when promise rejects with a non-Error value', async () => {
    fireAndForget(Promise.reject('string-error'), 'ctx');

    await new Promise(process.nextTick);

    expect(logger.warn).toHaveBeenCalledWith('fire_and_forget_failed', {
      context: 'ctx',
      error: 'string-error',
    });
  });
});
