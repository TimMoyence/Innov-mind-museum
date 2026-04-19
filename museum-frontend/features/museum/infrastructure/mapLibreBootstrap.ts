import { LogManager } from '@maplibre/maplibre-react-native';

import { reportError } from '@/shared/observability/errorReporting';

let bootstrapped = false;

/**
 * One-time MapLibre initialization: starts the native log subscription,
 * forwards errors to Sentry, and falls through to the library default console
 * logging for everything else. Idempotent — safe to call from every MapLibre
 * consumer import. No-op after the first invocation.
 */
export const bootstrapMapLibre = (): void => {
  if (bootstrapped) return;
  bootstrapped = true;

  LogManager.setLogLevel(__DEV__ ? 'info' : 'warn');
  LogManager.onLog(({ level, tag, message }) => {
    if (level === 'error') {
      reportError(new Error(`[MapLibre:${tag}] ${message}`), {
        component: 'MapLibre',
        tag,
      });
    }
    return false;
  });
  LogManager.start();
};

bootstrapMapLibre();
