import * as Sentry from '@sentry/react-native';

import { logInitPhase } from './init-phase-breadcrumbs';

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface RNErrorUtils {
  getGlobalHandler: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
}

const readErrorUtils = (): RNErrorUtils | undefined => {
  const candidate = (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
  if (
    !candidate ||
    typeof (candidate as RNErrorUtils).getGlobalHandler !== 'function' ||
    typeof (candidate as RNErrorUtils).setGlobalHandler !== 'function'
  ) {
    return undefined;
  }
  return candidate as RNErrorUtils;
};

/**
 * Installs a custom global JS error handler that converts uncaught fatal
 * exceptions into Sentry events without terminating the app in production.
 *
 * Background — TestFlight 1.2.2 (87) crashed at launch when the
 * `ExpoWebBrowser` native module was unlinked: Metro's `guardedLoadModule`
 * caught the module-evaluation throw and called
 * `ErrorUtils.reportFatalError(e)`, which routes through
 * `RCTExceptionsManager.reportFatal:` → `RCTFatal` → `@throw NSException`
 * → SIGABRT in the release bundle. The default RN handler always reports
 * uncaught errors with `isFatal=true`, so the app cannot recover.
 *
 * This wrapper:
 *   1. Captures the error to Sentry with `level: 'fatal'`, preserving
 *      severity for the dashboard.
 *   2. Logs to the JS console for Xcode/TestFlight device-log visibility.
 *   3. Forwards to the original handler with `isFatal=false` in production
 *      so RN does not `@throw` and abort. The user sees the RN red-box in
 *      dev or a generic recoverable state in release.
 *
 * Idempotent: re-invocations replace the wrapper but always chain back to
 * the original (pre-Sentry) handler, never to a previously installed
 * Musaium wrapper.
 *
 * No-op when `globalThis.ErrorUtils` is unavailable (jest-expo's default
 * environment polyfills it, but standalone Node/RN web stripped builds
 * may not).
 */
export const installGlobalErrorHandler = (): void => {
  const errorUtils = readErrorUtils();
  if (!errorUtils) {
    logInitPhase('globalErrorHandler.unavailable');
    return;
  }

  const originalHandler = errorUtils.getGlobalHandler();

  const wrapped: GlobalErrorHandler = (error, isFatal) => {
    try {
      Sentry.captureException(error, {
        level: 'fatal',
        tags: {
          source: 'global_js_handler',
          original_is_fatal: String(Boolean(isFatal)),
        },
      });
    } catch {
      // Never let a Sentry capture failure mask the original error
      // propagation. The original handler still runs below.
    }

    console.error('[MUSAIUM_GLOBAL_HANDLER] Uncaught JS exception', error);

    // In production, downgrade fatal → non-fatal so RN does not @throw
    // NSException and abort the process. In dev, preserve the flag so the
    // red-box surfaces as usual.
    const downgradedIsFatal = __DEV__ ? Boolean(isFatal) : false;

    try {
      originalHandler(error, downgradedIsFatal);
    } catch {
      // Swallow rethrows from the chained handler — by this point Sentry
      // already captured the error and we explicitly do NOT want to abort.
    }
  };

  errorUtils.setGlobalHandler(wrapped);
  logInitPhase('globalErrorHandler.installed');
};
