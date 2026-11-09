jest.mock('dotenv', () => ({ config: jest.fn() }));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('sentry — conditional initialization', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('initSentry is a no-op when env.sentry is falsy (no SENTRY_DSN)', () => {
    jest.isolateModules(() => {
      const { initSentry, isSentryEnabled } = require('@shared/observability/sentry');
      initSentry();
      expect(isSentryEnabled()).toBe(false);
    });
  });

  it('captureExceptionWithContext is a no-op when not initialized', () => {
    jest.isolateModules(() => {
      const {
        captureExceptionWithContext,
        isSentryEnabled,
      } = require('@shared/observability/sentry');
      expect(isSentryEnabled()).toBe(false);

      expect(() => captureExceptionWithContext(new Error('test'))).not.toThrow();
      expect(() =>
        captureExceptionWithContext(new Error('test'), { requestId: 'r1' }),
      ).not.toThrow();
    });
  });

  it('setupSentryExpressErrorHandler is a no-op when not initialized', () => {
    jest.isolateModules(() => {
      const {
        setupSentryExpressErrorHandler,
        isSentryEnabled,
      } = require('@shared/observability/sentry');
      expect(isSentryEnabled()).toBe(false);

      const fakeApp = {} as unknown as import('express').Express;
      expect(() => setupSentryExpressErrorHandler(fakeApp)).not.toThrow();
    });
  });

  it('startSpan executes callback with NOOP_SPAN when not initialized', () => {
    jest.isolateModules(() => {
      const { startSpan, isSentryEnabled } = require('@shared/observability/sentry');
      expect(isSentryEnabled()).toBe(false);

      const result = startSpan({ name: 'test', op: 'test' }, (span: any) => {
        expect(typeof span).not.toBe('undefined');
        return 42;
      });

      expect(result).toBe(42);
    });
  });

  it('setUser is a no-op when not initialized', () => {
    jest.isolateModules(() => {
      const { setUser, isSentryEnabled } = require('@shared/observability/sentry');
      expect(isSentryEnabled()).toBe(false);

      expect(() => setUser({ id: '123' })).not.toThrow();
      expect(() => setUser(null)).not.toThrow();
    });
  });

  it('NOOP_SPAN proxy supports chained method calls', () => {
    jest.isolateModules(() => {
      const { startSpan } = require('@shared/observability/sentry');

      startSpan({ name: 'test', op: 'test' }, (span: any) => {
        const result = span.setAttribute('key', 'value');
        expect(typeof result).not.toBe('undefined');
        span.setStatus('ok').end();
      });
    });
  });
});
