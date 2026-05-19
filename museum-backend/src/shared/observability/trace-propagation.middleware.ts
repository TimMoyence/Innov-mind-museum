/**
 * W4 W6.9 — distributed-tracing bridge.
 *
 * Reads `sentry-trace` + `baggage` headers (Sentry RN format) on every
 * incoming request and attaches them to the active OTel span as attributes.
 * The OTel HTTP instrumentation (`@opentelemetry/instrumentation-http`)
 * already auto-extracts W3C `traceparent` headers, so we don't reimplement
 * the full propagator chain here — Sentry RN stamps both formats since
 * `@sentry/react-native` >= 5.x, and this middleware ensures the Sentry-shaped
 * header survives the trip in the OTel side too (Langfuse + Grafana Tempo
 * read those attributes when reconstructing the call tree).
 *
 * NOT a propagator (does not call OTel `propagation.extract`). Doing the
 * full propagator wiring is a separate ADR (TD-26 candidate) because it
 * crosses ADR-045 (Sentry+OTel coexistence) constraints — adding a Sentry
 * OTel propagator would re-introduce the duplicate-span issue we explicitly
 * disabled (`skipOpenTelemetrySetup: true`). For V1, surfacing the trace
 * IDs as attributes is sufficient: Grafana span-link feature pivots on
 * attribute filters.
 *
 * Fail-open: if headers are absent or malformed, the middleware is a no-op.
 * Never throws.
 */

import { trace as otelTrace } from '@opentelemetry/api';

import type { NextFunction, Request, Response } from 'express';

const SENTRY_TRACE_RE =
  // sentry-trace = trace_id (32 hex) "-" span_id (16 hex) ["-" sampled (0|1)]
  // Per https://develop.sentry.dev/sdk/telemetry/traces/#header-sentry-trace
  /^([0-9a-f]{32})-([0-9a-f]{16})(?:-([01]))?$/i;

const HEADER_SENTRY_TRACE = 'sentry-trace';
const HEADER_BAGGAGE = 'baggage';

const ATTR_PARENT_TRACE_ID = 'musaium.parent.trace_id';
const ATTR_PARENT_SPAN_ID = 'musaium.parent.span_id';
const ATTR_PARENT_SAMPLED = 'musaium.parent.sampled';
const ATTR_BAGGAGE = 'musaium.parent.baggage';

function readHeader(req: Request, key: string): string | undefined {
  const raw = req.headers[key];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0];
  return undefined;
}

export function tracePropagationMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    const sentryTrace = readHeader(req, HEADER_SENTRY_TRACE);
    const baggage = readHeader(req, HEADER_BAGGAGE);

    if (!sentryTrace && !baggage) {
      next();
      return;
    }

    const span = otelTrace.getActiveSpan();
    if (!span) {
      next();
      return;
    }

    if (sentryTrace) {
      const match = SENTRY_TRACE_RE.exec(sentryTrace);
      if (match) {
        const [, traceId, spanId, sampledRaw] = match;
        span.setAttribute(ATTR_PARENT_TRACE_ID, traceId);
        span.setAttribute(ATTR_PARENT_SPAN_ID, spanId);
        // Optional capture: present only when the input includes the
        // trailing `-0` or `-1` sampled flag. Truthy check handles both
        // "not captured" (undefined at runtime) and "empty string" cases.
        if (sampledRaw) {
          span.setAttribute(ATTR_PARENT_SAMPLED, sampledRaw === '1');
        }
      }
    }

    if (baggage) {
      // Truncate to avoid pathological baggage payloads inflating span size.
      span.setAttribute(ATTR_BAGGAGE, baggage.slice(0, 1024));
    }
  } catch {
    // Fail-open — never break the request because of a tracing bridge bug.
  }
  next();
}

// Exported for unit tests so the regex is reachable.
export const __test = { SENTRY_TRACE_RE, HEADER_SENTRY_TRACE, HEADER_BAGGAGE };
