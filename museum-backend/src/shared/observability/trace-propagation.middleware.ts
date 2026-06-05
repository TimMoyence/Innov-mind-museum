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

// W3C Baggage cardinality bounds (https://www.w3.org/TR/baggage/#limits).
// MAX_BYTES = the 8192-byte total-length recommendation. MAX_MEMBERS = the ABNF
// hard cap (list-member 0*179 additional ⇒ 180 total), deliberately the structural
// maximum rather than the softer 64-member propagation recommendation — we only
// reject the truly pathological, the producer decides what to drop.
const BAGGAGE_MAX_BYTES = 8192;
const BAGGAGE_MAX_MEMBERS = 180;

// RFC 7230 token (`key` / `property` key): 1*tchar.
//   tchar = "!#$%&'*+-.^_`|~" / DIGIT / ALPHA
const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// OWS = *( SP / HTAB ), legal ONLY around "=", ";", ",". Trimmed with code-point
// scans rather than /[ \t]+/ regexes: a single character class cannot backtrack
// catastrophically, but sonarjs/slow-regex flags any `+`-quantified class and the
// lint gate runs --max-warnings=0.
function isOwsCode(code: number): boolean {
  return code === 0x20 || code === 0x09; // SP / HTAB
}
function trimOws(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isOwsCode(s.charCodeAt(start))) start += 1;
  while (end > start && isOwsCode(s.charCodeAt(end - 1))) end -= 1;
  return s.slice(start, end);
}
function trimOwsEnd(s: string): string {
  let end = s.length;
  while (end > 0 && isOwsCode(s.charCodeAt(end - 1))) end -= 1;
  return s.slice(0, end);
}
function stripLeadingOws(s: string): string {
  let start = 0;
  while (start < s.length && isOwsCode(s.charCodeAt(start))) start += 1;
  return s.slice(start);
}

// baggage value = *baggage-octet
//   baggage-octet = %x21 / %x23-2B / %x2D-3A / %x3C-5B / %x5D-7E
//   i.e. printable ASCII EXCEPT SP(0x20) " (0x22) ,(0x2C) ;(0x3B) \(0x5C) and all CTLs.
function isBaggageValue(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (
      code === 0x21 ||
      (code >= 0x23 && code <= 0x2b) ||
      (code >= 0x2d && code <= 0x3a) ||
      (code >= 0x3c && code <= 0x5b) ||
      (code >= 0x5d && code <= 0x7e)
    ) {
      continue;
    }
    return false;
  }
  return true;
}

// property = key OWS "=" OWS value / key
function isValidProperty(raw: string): boolean {
  const eq = raw.indexOf('=');
  if (eq === -1) {
    // key-only property
    return TOKEN_RE.test(raw);
  }
  const key = trimOwsEnd(raw.slice(0, eq));
  const rest = stripLeadingOws(raw.slice(eq + 1));
  return TOKEN_RE.test(key) && isBaggageValue(rest);
}

// list-member = key OWS "=" OWS value *( OWS ";" OWS property )
function isValidListMember(raw: string): boolean {
  const segments = raw.split(';');
  const kv = segments[0];
  const eq = kv.indexOf('=');
  if (eq === -1) return false; // a list-member MUST contain key "=" value
  // trimOwsEnd strips only trailing OWS before "="; any INTERNAL whitespace stays
  // in `key` and is rejected by TOKEN_RE (a space is not a tchar).
  const key = trimOwsEnd(kv.slice(0, eq));
  if (!TOKEN_RE.test(key)) return false;
  // trimOws (both ends): OWS is legal after "=" AND before the first ";"
  // (ABNF: ... "=" OWS value *( OWS ";" ... )). A non-OWS char (newline, internal
  // space) survives the trim and is then rejected by isBaggageValue.
  const value = trimOws(kv.slice(eq + 1));
  if (!isBaggageValue(value)) return false;
  // remaining segments are properties (with OWS around ";")
  for (let i = 1; i < segments.length; i += 1) {
    if (!isValidProperty(trimOws(segments[i]))) return false;
  }
  return true;
}

/**
 * Validates a raw `baggage` header against the W3C Baggage grammar
 * (https://www.w3.org/TR/baggage/). All-or-nothing: returns false if ANY
 * list-member is malformed, or if cardinality limits are exceeded. SP (0x20)
 * is only legal as OWS around the "=" ";" "," delimiters, never inside a
 * key/value — this is what rejects header-smuggling and dashboard-pollution
 * attempts (newlines, internal spaces, empty keys).
 */
export function isValidW3CBaggage(raw: string): boolean {
  if (raw.length === 0 || raw.length > BAGGAGE_MAX_BYTES) return false;
  const members = raw.split(',');
  if (members.length > BAGGAGE_MAX_MEMBERS) return false;
  for (const member of members) {
    // OWS around "," is allowed; trim it before validating the list-member.
    const trimmed = trimOws(member);
    if (trimmed.length === 0) return false; // empty member (e.g. trailing/double comma)
    if (!isValidListMember(trimmed)) return false;
  }
  return true;
}

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

    if (baggage && isValidW3CBaggage(baggage)) {
      // Validated against the W3C Baggage grammar (TD-48): a malformed header
      // (control chars, internal spaces, empty keys, newline smuggling) is
      // dropped silently so it can't pollute the span attribute. Truncate the
      // validated value to avoid pathological payloads inflating span size.
      span.setAttribute(ATTR_BAGGAGE, baggage.slice(0, 1024));
    }
  } catch {
    // Fail-open — never break the request because of a tracing bridge bug.
  }
  next();
}

// Exported for unit tests so the regex is reachable.
export const __test = { SENTRY_TRACE_RE, HEADER_SENTRY_TRACE, HEADER_BAGGAGE, isValidW3CBaggage };
