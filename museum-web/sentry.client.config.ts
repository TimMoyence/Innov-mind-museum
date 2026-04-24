import * as Sentry from '@sentry/nextjs';

import {
  scrubEvent,
  shouldDropBreadcrumb,
  type ScrubbableBreadcrumb,
  type ScrubbableEvent,
} from '@/lib/sentry-scrubber';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend: (event) => scrubEvent(event as unknown as ScrubbableEvent) as typeof event,
  beforeBreadcrumb: (breadcrumb) =>
    shouldDropBreadcrumb(breadcrumb as ScrubbableBreadcrumb) ? null : breadcrumb,
});
