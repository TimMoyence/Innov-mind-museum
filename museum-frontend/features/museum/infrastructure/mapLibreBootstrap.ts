import { LogManager } from '@maplibre/maplibre-react-native';

import { readEnvString } from '@/shared/lib/env';
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

// Skip the top-level invocation under Jest. `LogManager.start()` opens a
// native subscription (file descriptor + event-loop callback) that is not
// `.unref()`'d, so when test files transitively import this module via
// `app/_layout.tsx`, Jest keeps the worker alive after the suite ends
// ("Jest did not exit one second after the test run has completed").
// `JEST_WORKER_ID` is set by Jest on every worker; absent in app runtime.
if (readEnvString(process.env.JEST_WORKER_ID) === undefined) {
  bootstrapMapLibre();
}
