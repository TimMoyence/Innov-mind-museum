/**
 * Sentry wrapper tests — verifies both disabled (no DSN) and enabled (with DSN) paths.
 *
 * The existing sentry.test.ts covers the disabled/no-op branches.
 * This file complements it by also verifying the enabled path via @sentry/node mocks.
 */

const mockSentryInit = jest.fn();
const mockSetupExpressErrorHandler = jest.fn();
const mockCaptureException = jest.fn();
const mockSetUser = jest.fn();
const mockWithScope = jest.fn((cb: (scope: { setTag: jest.Mock }) => void) => {
  cb({ setTag: jest.fn() });
});
const mockStartSpan = jest.fn((_ctx: Record<string, unknown>, cb: (span: unknown) => unknown) =>
  cb({ setAttribute: jest.fn() }),
);
const mockGetDefaultIntegrations = jest.fn(() => []);

jest.mock('@sentry/node', () => ({
  init: mockSentryInit,
  setupExpressErrorHandler: mockSetupExpressErrorHandler,
  captureException: mockCaptureException,
  setUser: mockSetUser,
  withScope: mockWithScope,
  startSpan: mockStartSpan,
  getDefaultIntegrations: mockGetDefaultIntegrations,
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('sentry wrapper', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
    jest.resetModules();
  });

  // ── Disabled path (no DSN) ────────────────────────────────────

  describe('when SENTRY_DSN is not configured', () => {
    it('initSentry does not call Sentry.init', () => {
      jest.isolateModules(() => {
        delete process.env.SENTRY_DSN;
        const { initSentry } = require('@shared/observability/sentry');
        initSentry();
        expect(mockSentryInit).not.toHaveBeenCalled();
      });
    });

    it('captureExceptionWithContext is a no-op', () => {
      jest.isolateModules(() => {
        delete process.env.SENTRY_DSN;
        const { captureExceptionWithContext } = require('@shared/observability/sentry');
        captureExceptionWithContext(new Error('test'), { requestId: 'r1' });
        expect(mockWithScope).not.toHaveBeenCalled();
        expect(mockCaptureException).not.toHaveBeenCalled();
      });
    });

    it('setUser is a no-op', () => {
      jest.isolateModules(() => {
        delete process.env.SENTRY_DSN;
        const { setUser } = require('@shared/observability/sentry');
        setUser({ id: '42' });
        expect(mockSetUser).not.toHaveBeenCalled();
      });
    });

    it('setupSentryExpressErrorHandler is a no-op', () => {
      jest.isolateModules(() => {
        delete process.env.SENTRY_DSN;
        const { setupSentryExpressErrorHandler } = require('@shared/observability/sentry');
        setupSentryExpressErrorHandler({} as import('express').Express);
        expect(mockSetupExpressErrorHandler).not.toHaveBeenCalled();
      });
    });

    it('startSpan calls callback with NOOP_SPAN', () => {
      jest.isolateModules(() => {
        delete process.env.SENTRY_DSN;
        const { startSpan } = require('@shared/observability/sentry');
        const result = startSpan({ name: 'op', op: 'test' }, () => 'value');
        expect(result).toBe('value');
        // Sentry.startSpan should NOT be called — the wrapper uses the proxy
        expect(mockStartSpan).not.toHaveBeenCalled();
      });
    });
  });

  // ── Enabled path (with DSN) ───────────────────────────────────

  describe('when SENTRY_DSN is configured', () => {
    it('initSentry calls Sentry.init with correct config', () => {
      jest.isolateModules(() => {
        process.env.SENTRY_DSN = 'https://key@sentry.io/123';
        const { initSentry, isSentryEnabled } = require('@shared/observability/sentry');
        initSentry();
        expect(mockSentryInit).toHaveBeenCalledWith(
          expect.objectContaining({
            dsn: 'https://key@sentry.io/123',
          }),
        );
        expect(isSentryEnabled()).toBe(true);
      });
    });

    it('captureExceptionWithContext delegates to Sentry.withScope', () => {
      jest.isolateModules(() => {
        process.env.SENTRY_DSN = 'https://key@sentry.io/123';
        const { initSentry, captureExceptionWithContext } = require('@shared/observability/sentry');
        initSentry();
        const err = new Error('boom');
        captureExceptionWithContext(err, { requestId: 'r1', path: '/api/test' });
        expect(mockWithScope).toHaveBeenCalled();
        expect(mockCaptureException).toHaveBeenCalledWith(err);
      });
    });

    it('setUser delegates to Sentry.setUser', () => {
      jest.isolateModules(() => {
        process.env.SENTRY_DSN = 'https://key@sentry.io/123';
        const { initSentry, setUser } = require('@shared/observability/sentry');
        initSentry();
        setUser({ id: '42' });
        expect(mockSetUser).toHaveBeenCalledWith({ id: '42' });
      });
    });

    it('setupSentryExpressErrorHandler delegates to Sentry', () => {
      jest.isolateModules(() => {
        process.env.SENTRY_DSN = 'https://key@sentry.io/123';
        const {
          initSentry,
          setupSentryExpressErrorHandler,
        } = require('@shared/observability/sentry');
        initSentry();
        const fakeApp = {} as import('express').Express;
        setupSentryExpressErrorHandler(fakeApp);
        expect(mockSetupExpressErrorHandler).toHaveBeenCalledWith(fakeApp);
      });
    });

    it('startSpan delegates to Sentry.startSpan when initialized', () => {
      jest.isolateModules(() => {
        process.env.SENTRY_DSN = 'https://key@sentry.io/123';
        const { initSentry, startSpan } = require('@shared/observability/sentry');
        initSentry();
        const ctx = { name: 'db.query', op: 'db' };
        const callback = jest.fn(() => 'result');
        startSpan(ctx, callback);
        expect(mockStartSpan).toHaveBeenCalledWith(ctx, callback);
      });
    });
  });
});
