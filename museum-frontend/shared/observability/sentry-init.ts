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

// W4 W6.9 — distributed tracing. Sentry RN stamps `sentry-trace` + `baggage`
// headers on outbound fetch requests whose URL matches one of the patterns
// below. The BE reads them via `trace-propagation.middleware.ts` and attaches
// the trace context to the active OTel span so spans correlate end-to-end.
// Backend CORS allowlist already includes both headers (museum-backend/src/app.ts).
// Only the prod API host is whitelisted — anything else is a leak risk.
const tracePropagationTargets: RegExp[] = [
  /^https:\/\/api\.musaium\.com\//,
  // Local dev (host LAN IP varies — match the /api/ path conservatively).
  /^https?:\/\/[^/]+\/api\//,
];

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
    tracePropagationTargets,
    integrations: [Sentry.reactNativeTracingIntegration(), reactNavigationIntegration],
    enableAutoPerformanceTracing: true,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event as ScrubbableEvent) as typeof event,
    beforeBreadcrumb: (breadcrumb) =>
      shouldDropBreadcrumb(breadcrumb as ScrubbableBreadcrumb) ? null : breadcrumb,
  });
};
