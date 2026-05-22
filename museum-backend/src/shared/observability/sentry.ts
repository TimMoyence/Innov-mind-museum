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

/** No-op span used when Sentry is disabled. Proxy makes chained `.setAttribute(...).end()` safe. */
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

  // ADR-045 Sentry+OTel coexistence — boot ordering (post-R2, 2026-05-19):
  //   Sentry init runs first (`src/instrumentation.ts:10`), OTel NodeSDK starts after
  //   (`src/instrumentation.ts:11`). Sentry-first guarantees that errors thrown by OTel
  //   auto-instrumentation setup are captured. The two settings below prevent Sentry
  //   from duplicating the work OTel performs (previously stacked ~21 finish listeners
  //   on every ServerResponse → MaxListenersExceededWarning):
  //   1. `skipOpenTelemetrySetup: true` — Sentry won't create its OWN OTel NodeSDK
  //   2. `getDefaultIntegrationsWithoutPerformance()` — drops ~25 perf integrations
  //      (Express/Postgres/Redis/Kafka) that mirror OTel auto-instrumentations 1:1.
  //      Errors/breadcrumbs/console/requestData/linkedErrors kept.
  // Trade-off (intentional per 2026-05-12): Sentry APM/traces no longer reach Sentry
  // dashboard; spans go exclusively to OTel collector via OTLP. Sentry = errors+breadcrumbs.
  Sentry.init({
    dsn: env.sentry.dsn,
    environment: env.sentry.environment,
    release: env.sentry.release,
    // Anchored on both ends so neither
    // `https://api.musaium.com.attacker.com` nor
    // `http://localhost:30001234` slip past the allowlist and trigger
    // outbound `sentry-trace` / `baggage` header injection to a hostile
    // origin. Allows the bare hostname or hostname + path (`$|/`).
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

/** Ordering: must be called AFTER routes and BEFORE the custom `errorHandler` middleware. */
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
        // R3 (2026-05-21) — defense-in-depth source scrub :
        // strip sensitive query-string params (`code`, `state`, `email`,
        // `phone`, `token`, ...) BEFORE Sentry indexes the tag value.
        // `error.middleware.ts:97` passes `path: req.originalUrl` which often
        // carries magic-link / OAuth / signup PII in the query-string.
        // Non-URL-like values (`method: 'GET'`, `requestId: '…'`) flow through
        // unchanged (no false positives — see `isUrlLikeValue` heuristic).
        // The downstream `scrubEvent` tag traversal (`beforeSend`) is the
        // second layer that catches `Sentry.setTag` calls made outside this
        // wrapper. See `lib-docs/@sentry/node/PATTERNS.md` §6 + §9.1.
        const scrubbed = isUrlLikeValue(value) ? scrubUrl(value) : value;
        scope.setTag(key, scrubbed);
      }
    }
    Sentry.captureException(error);
  });
};

/** When Sentry is disabled the callback still executes, receiving NOOP_SPAN. */
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
