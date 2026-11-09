import { LogManager } from '@maplibre/maplibre-react-native';

import { readEnvString } from '@/shared/lib/env';
import { reportError } from '@/shared/observability/errorReporting';

let bootstrapped = false;

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

if (readEnvString(process.env.JEST_WORKER_ID) === undefined) {
  bootstrapMapLibre();
}
