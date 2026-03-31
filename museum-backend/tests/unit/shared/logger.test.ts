import { logger } from '@shared/logger/logger';

describe('logger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs info as JSON with level, message, and timestamp', () => {
    logger.info('test_info');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.level).toBe('info');
    expect(output.message).toBe('test_info');
    expect(new Date(output.timestamp).getTime()).not.toBeNaN();
    expect(output.service).toBe('museum-backend');
  });

  it('logs info with context', () => {
    logger.info('test_info', { requestId: 'r1', extra: 42 });

    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.requestId).toBe('r1');
    expect(output.extra).toBe(42);
  });

  it('logs warn to console.warn', () => {
    logger.warn('test_warn');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(output.level).toBe('warn');
    expect(output.message).toBe('test_warn');
  });

  it('logs warn with context', () => {
    logger.warn('test_warn', { key: 'value' });

    const output = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(output.key).toBe('value');
  });

  it('logs error to console.error', () => {
    logger.error('test_error');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(output.level).toBe('error');
    expect(output.message).toBe('test_error');
  });

  it('logs error with context', () => {
    logger.error('test_error', { error: 'something broke' });

    const output = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(output.error).toBe('something broke');
  });

  it('includes default fields in all log levels', () => {
    logger.info('test');
    logger.warn('test');
    logger.error('test');

    for (const spy of [logSpy, warnSpy, errorSpy]) {
      const output = JSON.parse(spy.mock.calls[0][0]);
      expect(output.service).toBe('museum-backend');
      expect(typeof output.environment).toBe('string');
      expect(typeof output.version).toBe('string');
      expect(typeof output.hostname).toBe('string');
    }
  });

  it('logs without context (undefined context branch)', () => {
    logger.info('no_context');

    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.message).toBe('no_context');
    // Should only have default fields, no extra context keys
  });
});
