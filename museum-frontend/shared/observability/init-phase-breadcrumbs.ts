import * as Sentry from '@sentry/react-native';

export const logInitPhase = (phase: string, data?: Record<string, unknown>): void => {
  const ts = new Date().toISOString();
  console.log('[MUSAIUM_INIT] js.%s ts=%s', phase, ts, data ?? {});
  Sentry.addBreadcrumb({
    category: 'rn.init',
    level: 'info',
    message: `js.${phase}`,
    data: { ts, ...(data ?? {}) },
  });
};
