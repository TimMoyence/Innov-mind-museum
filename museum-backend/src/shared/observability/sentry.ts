import * as Sentry from '@sentry/node';

import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import {
  scrubEvent,
  shouldDropBreadcrumb,
  type ScrubbableBreadcrumb,
  type ScrubbableEvent,
} from './sentry-scrubber';

import type { Span } from '@sentry/node';
import type { Express } from 'express';

let initialized = false;

/**
 * No-op span used when Sentry is disabled — safe to call any method on.
 * Every property access returns a function that returns NOOP_SPAN, so
 * chained method calls (`span.setAttribute(...).end()`) never crash.
 */
function noopSpanMethod(): Span {
  return NOOP_SPAN;
}
function noopSpanProxyGet(): () => Span {
  return noopSpanMethod;
}
const NOOP_SPAN: Span = new Proxy({} as Span, {
  get: noopSpanProxyGet,
});

/** Returns `true` when Sentry has been successfully initialized. */
export const isSentryEnabled = (): boolean => initialized;

/**
 * Initializes the Sentry SDK using the configuration from `env.sentry`.
 * No-op when `SENTRY_DSN` is not configured — the app runs identically without Sentry.
 */
export const initSentry = (): void => {
  if (!env.sentry) {
    logger.info('sentry_disabled', { reason: 'SENTRY_DSN not configured' });
    return;
  }

  // The OTel SDK is already initialised by `src/instrumentation.ts` BEFORE
  // this runs and provides all HTTP/Express/Postgres/Redis/etc. instrumentation
  // via `getNodeAutoInstrumentations()`. Two settings here prevent Sentry from
  // duplicating that work — which previously stacked ~21 finish listeners on
  // every ServerResponse and tripped Node's MaxListenersExceededWarning:
  //   1. `skipOpenTelemetrySetup: true` — Sentry won't create its OWN OTel
  //      NodeSDK on top of ours (Sentry v8+ ships an internal OTel SDK; left
  //      to its defaults it double-wraps http/express).
  //   2. `getDefaultIntegrationsWithoutPerformance()` — drops Sentry's
  //      ~25 performance integrations (Express, Postgres, Redis, Kafka, …)
  //      that mirror OTel's auto-instrumentations one-for-one. Errors,
  //      breadcrumbs, console capture, requestData, linkedErrors, etc.
  //      are kept (those don't duplicate OTel).
  // Trade-off (intentional per 2026-05-12 decision): Sentry APM/traces no
  // longer reach the Sentry dashboard; spans go exclusively to the OTel
  // collector via OTLP. Sentry remains the error + breadcrumb pipeline.
  Sentry.init({
    dsn: env.sentry.dsn,
    environment: env.sentry.environment,
    release: env.sentry.release,
    tracesSampleRate: env.sentry.tracesSampleRate,
    profilesSampleRate: env.sentry.profilesSampleRate,
    skipOpenTelemetrySetup: true,
    integrations: [...Sentry.getDefaultIntegrationsWithoutPerformance()],
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event as ScrubbableEvent) as typeof event,
    beforeBreadcrumb: (breadcrumb) =>
      shouldDropBreadcrumb(breadcrumb as ScrubbableBreadcrumb) ? null : breadcrumb,
  });

  initialized = true;
  logger.info('sentry_initialized', {
    environment: env.sentry.environment,
    release: env.sentry.release,
    tracesSampleRate: env.sentry.tracesSampleRate,
    profilesSampleRate: env.sentry.profilesSampleRate,
  });
};

/**
 * Registers the Sentry Express error handler on the app.
 * Must be called AFTER routes and BEFORE the custom `errorHandler` middleware.
 * No-op when Sentry is not initialized.
 */
export const setupSentryExpressErrorHandler = (app: Express): void => {
  if (!initialized) return;
  Sentry.setupExpressErrorHandler(app);
};

/**
 * Captures an exception in Sentry with additional context tags.
 * No-op when Sentry is not initialized — safe to call unconditionally.
 *
 * @param error - The error to report.
 * @param context - Key-value pairs attached as tags (e.g. requestId, method, path).
 */
export const captureExceptionWithContext = (
  error: unknown,
  context?: Record<string, string | undefined>,
): void => {
  if (!initialized) return;

  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined) {
          scope.setTag(key, value);
        }
      }
    }
    Sentry.captureException(error);
  });
};

/**
 * Wraps an operation in a Sentry performance span.
 * No-op when Sentry is not initialized — the callback still executes with a dummy span.
 *
 * @param context - Span name, operation category, and optional attributes.
 * @param context.name - Human-readable span name.
 * @param context.op - Operation category (e.g. `ai.orchestrate`).
 * @param context.attributes - Optional key-value attributes to attach to the span.
 * @param callback - The work to measure. Receives the active span for attribute setting.
 */
export const startSpan = <T>(
  context: { name: string; op: string; attributes?: Record<string, string | number | boolean> },
  callback: (span: Span) => T,
): T => {
  if (!initialized) return callback(NOOP_SPAN);
  return Sentry.startSpan(context, callback);
};

/**
 * Sets the current user on the Sentry scope for error/performance correlation.
 * No-op when Sentry is not initialized.
 *
 * @param user - User identity (pass `null` to clear).
 */
export const setUser = (user: { id: string } | null): void => {
  if (!initialized) return;
  Sentry.setUser(user);
};
