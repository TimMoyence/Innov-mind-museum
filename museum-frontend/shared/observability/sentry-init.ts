import * as Sentry from '@sentry/react-native';

import {
  scrubEvent,
  shouldDropBreadcrumb,
  type ScrubbableBreadcrumb,
  type ScrubbableEvent,
} from '@/shared/observability/sentry-scrubber';

/** Navigation integration shared with the root layout so it can register the nav container. */
export const reactNavigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

/**
 * Initializes Sentry for the mobile app with PII scrubbing enabled.
 * Safe to call when `dsn` is null/empty — in that case Sentry is disabled.
 *
 * @param dsn - Platform-specific DSN resolved by the caller.
 */
export const initSentry = (dsn: string | null | undefined): void => {
  const resolved = dsn ?? '';
  Sentry.init({
    dsn: resolved,
    enabled: resolved.length > 0,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2,
    integrations: [Sentry.reactNativeTracingIntegration(), reactNavigationIntegration],
    enableAutoPerformanceTracing: true,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event as unknown as ScrubbableEvent) as typeof event,
    beforeBreadcrumb: (breadcrumb) =>
      shouldDropBreadcrumb(breadcrumb as ScrubbableBreadcrumb) ? null : breadcrumb,
  });
};
