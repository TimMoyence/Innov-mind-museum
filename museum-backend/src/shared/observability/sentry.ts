import * as Sentry from '@sentry/node';

import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { Span } from '@sentry/node';
import type { Express } from 'express';


let initialized = false;

/** No-op span used when Sentry is disabled — safe to call any method on. */
const NOOP_SPAN = new Proxy({} as Span, {
  get: () => () => NOOP_SPAN,
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

  Sentry.init({
    dsn: env.sentry.dsn,
    environment: env.sentry.environment,
    release: env.sentry.release,
    tracesSampleRate: env.sentry.tracesSampleRate,
    profilesSampleRate: env.sentry.profilesSampleRate,
    integrations: [
      ...Sentry.getDefaultIntegrations({}),
    ],
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
