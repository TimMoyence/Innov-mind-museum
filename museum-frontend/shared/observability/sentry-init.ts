import * as Sentry from '@sentry/react-native';

import {
  scrubEvent,
  shouldDropBreadcrumb,
  type ScrubbableBreadcrumb,
  type ScrubbableEvent,
} from '@/shared/observability/sentry-scrubber';

export const reactNavigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

const tracePropagationTargets: RegExp[] = [
  /^https:\/\/api\.musaium\.com\//,
  /^https?:\/\/[^/]+\/api\//,
];

export const initSentry = (dsn: string | null | undefined): void => {
  const resolved = dsn ?? '';
  Sentry.init({
    dsn: resolved,
    enabled: resolved.length > 0,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2,
    tracePropagationTargets,
    integrations: [Sentry.reactNativeTracingIntegration(), reactNavigationIntegration],
    enableAutoPerformanceTracing: true,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event as ScrubbableEvent) as typeof event,
    beforeBreadcrumb: (breadcrumb) =>
      shouldDropBreadcrumb(breadcrumb as ScrubbableBreadcrumb) ? null : breadcrumb,
  });
};
