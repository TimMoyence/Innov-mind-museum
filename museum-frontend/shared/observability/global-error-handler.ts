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
    } catch {}

    console.error('[MUSAIUM_GLOBAL_HANDLER] Uncaught JS exception', error);

    const downgradedIsFatal = __DEV__ ? Boolean(isFatal) : false;

    try {
      originalHandler(error, downgradedIsFatal);
    } catch {}
  };

  errorUtils.setGlobalHandler(wrapped);
  logInitPhase('globalErrorHandler.installed');
};
