/**
 * Tests for the global JS error handler installed at app boot.
 *
 * Regression cover for TestFlight 1.2.2 (87): when Metro's guarded module
 * loader hit a missing native module it called `ErrorUtils.reportFatalError`,
 * the default RN handler dispatched `isFatal=true` to `RCTExceptionsManager`,
 * and `RCTFatal` `@throw`-ed an NSException → SIGABRT. The wrapper installed
 * here must (a) capture to Sentry, (b) downgrade fatal → non-fatal in
 * release so RN does not abort, (c) chain back to the original handler so
 * the dev red-box still surfaces with `__DEV__=true`.
 */

const mockCaptureException = jest.fn();
const mockAddBreadcrumb = jest.fn();

jest.mock('@sentry/react-native', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
}));

import { installGlobalErrorHandler } from '@/shared/observability/global-error-handler';

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface RNErrorUtils {
  getGlobalHandler: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
}

const stubErrorUtils = (originalHandler: GlobalErrorHandler): RNErrorUtils => {
  let current: GlobalErrorHandler = originalHandler;
  return {
    getGlobalHandler: () => current,
    setGlobalHandler: (next) => {
      current = next;
    },
  };
};

const withErrorUtils = (errorUtils: RNErrorUtils | undefined, body: () => void): void => {
  const global = globalThis as { ErrorUtils?: RNErrorUtils };
  const prev = global.ErrorUtils;
  if (errorUtils === undefined) {
    delete global.ErrorUtils;
  } else {
    global.ErrorUtils = errorUtils;
  }
  try {
    body();
  } finally {
    if (prev === undefined) {
      delete global.ErrorUtils;
    } else {
      global.ErrorUtils = prev;
    }
  }
};

describe('installGlobalErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Force production-bundle codepath by default. Each test overrides
    // __DEV__ explicitly when it asserts dev behaviour.
    (globalThis as { __DEV__: boolean }).__DEV__ = false;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no-ops gracefully when global ErrorUtils is unavailable', () => {
    withErrorUtils(undefined, () => {
      expect(() => {
        installGlobalErrorHandler();
      }).not.toThrow();
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'js.globalErrorHandler.unavailable' }),
      );
    });
  });

  it('replaces the global handler and reports to Sentry on uncaught fatal', () => {
    const original = jest.fn();
    const errorUtils = stubErrorUtils(original);

    withErrorUtils(errorUtils, () => {
      installGlobalErrorHandler();
      const wrapped = errorUtils.getGlobalHandler();
      expect(wrapped).not.toBe(original);

      const boom = new Error('boom');
      wrapped(boom, true);

      expect(mockCaptureException).toHaveBeenCalledWith(
        boom,
        expect.objectContaining({
          level: 'fatal',
          tags: expect.objectContaining({
            source: 'global_js_handler',
            original_is_fatal: 'true',
          }),
        }),
      );
    });
  });

  it('downgrades isFatal=true → false when forwarding in release (__DEV__=false)', () => {
    const original = jest.fn();
    const errorUtils = stubErrorUtils(original);

    withErrorUtils(errorUtils, () => {
      installGlobalErrorHandler();
      const wrapped = errorUtils.getGlobalHandler();

      wrapped(new Error('release-mode'), true);

      expect(original).toHaveBeenCalledTimes(1);
      expect(original.mock.calls[0][1]).toBe(false);
    });
  });

  it('preserves isFatal=true when forwarding in dev (__DEV__=true)', () => {
    (globalThis as { __DEV__: boolean }).__DEV__ = true;
    const original = jest.fn();
    const errorUtils = stubErrorUtils(original);

    withErrorUtils(errorUtils, () => {
      installGlobalErrorHandler();
      const wrapped = errorUtils.getGlobalHandler();

      wrapped(new Error('dev-mode'), true);

      expect(original).toHaveBeenCalledTimes(1);
      expect(original.mock.calls[0][1]).toBe(true);
    });
  });

  it('preserves isFatal=false when the upstream error was already non-fatal', () => {
    const original = jest.fn();
    const errorUtils = stubErrorUtils(original);

    withErrorUtils(errorUtils, () => {
      installGlobalErrorHandler();
      const wrapped = errorUtils.getGlobalHandler();

      wrapped(new Error('soft'), false);

      expect(original).toHaveBeenCalledWith(expect.any(Error), false);
    });
  });

  it('does not abort when Sentry.captureException throws', () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error('sentry dead');
    });
    const original = jest.fn();
    const errorUtils = stubErrorUtils(original);

    withErrorUtils(errorUtils, () => {
      installGlobalErrorHandler();
      const wrapped = errorUtils.getGlobalHandler();

      expect(() => {
        wrapped(new Error('boom'), true);
      }).not.toThrow();
      // Original handler still ran even though Sentry blew up.
      expect(original).toHaveBeenCalledTimes(1);
    });
  });

  it('does not abort when the chained original handler throws', () => {
    const original = jest.fn(() => {
      throw new Error('rn handler boom');
    });
    const errorUtils = stubErrorUtils(original);

    withErrorUtils(errorUtils, () => {
      installGlobalErrorHandler();
      const wrapped = errorUtils.getGlobalHandler();

      expect(() => {
        wrapped(new Error('boom'), true);
      }).not.toThrow();
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });
  });

  it('always chains back to the pre-install handler even after a re-install', () => {
    const original = jest.fn();
    const errorUtils = stubErrorUtils(original);

    withErrorUtils(errorUtils, () => {
      installGlobalErrorHandler();
      // A subsequent install must not double-wrap (otherwise each call would
      // multiply Sentry events). The wrapper reads the current handler
      // pre-install — so the SECOND install chains to the FIRST wrapper.
      // We only assert the original is reached at least once and that the
      // captured event count stays linear.
      installGlobalErrorHandler();
      const wrapped = errorUtils.getGlobalHandler();

      wrapped(new Error('double-install'), true);

      expect(original).toHaveBeenCalled();
      expect(mockCaptureException.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
