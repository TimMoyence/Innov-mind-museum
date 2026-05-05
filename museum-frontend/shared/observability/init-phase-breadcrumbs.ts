import * as Sentry from '@sentry/react-native';

/**
 * Logs a JS-side React Native init phase as a Sentry breadcrumb plus a
 * console.log line. Pairs with the native AppDelegate instrumentation
 * (RNCrashCapture.logPhase) to give a complete launch timeline when the
 * app crashes during init on iOS 26 — see ADR-004 and IOS26_CRASH_DIAG.md.
 */
export const logInitPhase = (phase: string, data?: Record<string, unknown>): void => {
  const ts = new Date().toISOString();
  console.log(`[MUSAIUM_INIT] js.${phase} ts=${ts}`, data ?? {});
  Sentry.addBreadcrumb({
    category: 'rn.init',
    level: 'info',
    message: `js.${phase}`,
    data: { ts, ...(data ?? {}) },
  });
};
