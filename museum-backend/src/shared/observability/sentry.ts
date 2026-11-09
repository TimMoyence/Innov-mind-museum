import * as Sentry from '@sentry/node';

import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import {
  isUrlLikeValue,
  scrubEvent,
  scrubUrl,
  shouldDropBreadcrumb,
  type ScrubbableEvent,
} from './sentry-scrubber';

import type { Span } from '@sentry/node';
import type { Express } from 'express';

let initialized = false;

function noopSpanMethod(): Span {
  return NOOP_SPAN;
}
function noopSpanProxyGet(): () => Span {
  return noopSpanMethod;
}
const NOOP_SPAN: Span = new Proxy({} as Span, {
  get: noopSpanProxyGet,
});

export const isSentryEnabled = (): boolean => initialized;

export const initSentry = (): void => {
  if (!env.sentry) {
    logger.info('sentry_disabled', { reason: 'SENTRY_DSN not configured' });
    return;
  }

  Sentry.init({
    dsn: env.sentry.dsn,
    environment: env.sentry.environment,
    release: env.sentry.release,
    tracePropagationTargets: [
      /^https:\/\/api\.musaium\.com($|\/)/,
      /^http:\/\/localhost:3000($|\/)/,
    ],
    tracesSampleRate: env.sentry.tracesSampleRate,
    profileSessionSampleRate: env.sentry.profileSessionSampleRate,
    profileLifecycle: 'trace',
    skipOpenTelemetrySetup: true,
    integrations: [...Sentry.getDefaultIntegrationsWithoutPerformance()],
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event as ScrubbableEvent) as typeof event,
    beforeBreadcrumb: (breadcrumb) => (shouldDropBreadcrumb(breadcrumb) ? null : breadcrumb),
  });

  initialized = true;
  logger.info('sentry_initialized', {
    environment: env.sentry.environment,
    release: env.sentry.release,
    tracesSampleRate: env.sentry.tracesSampleRate,
    profileSessionSampleRate: env.sentry.profileSessionSampleRate,
    tracePropagationTargetsCount: 2,
  });
};

export const setupSentryExpressErrorHandler = (app: Express): void => {
  if (!initialized) return;
  Sentry.setupExpressErrorHandler(app);
};

export const captureExceptionWithContext = (
  error: unknown,
  context?: Record<string, string | undefined>,
): void => {
  if (!initialized) return;

  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        if (value === undefined) continue;
        const scrubbed = isUrlLikeValue(value) ? scrubUrl(value) : value;
        scope.setTag(key, scrubbed);
      }
    }
    Sentry.captureException(error);
  });
};

export const startSpan = <T>(
  context: { name: string; op: string; attributes?: Record<string, string | number | boolean> },
  callback: (span: Span) => T,
): T => {
  if (!initialized) return callback(NOOP_SPAN);
  return Sentry.startSpan(context, callback);
};

export const setUser = (user: { id: string } | null): void => {
  if (!initialized) return;
  Sentry.setUser(user);
};
