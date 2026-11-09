import { trace as otelTrace } from '@opentelemetry/api';

import type { NextFunction, Request, Response } from 'express';

const SENTRY_TRACE_RE = /^([0-9a-f]{32})-([0-9a-f]{16})(?:-([01]))?$/i;

const HEADER_SENTRY_TRACE = 'sentry-trace';
const HEADER_BAGGAGE = 'baggage';

const ATTR_PARENT_TRACE_ID = 'musaium.parent.trace_id';
const ATTR_PARENT_SPAN_ID = 'musaium.parent.span_id';
const ATTR_PARENT_SAMPLED = 'musaium.parent.sampled';
const ATTR_BAGGAGE = 'musaium.parent.baggage';

const BAGGAGE_MAX_BYTES = 8192;
const BAGGAGE_MAX_MEMBERS = 180;

const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
function isOwsCode(code: number): boolean {
  return code === 0x20 || code === 0x09;
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

function isValidProperty(raw: string): boolean {
  const eq = raw.indexOf('=');
  if (eq === -1) {
    return TOKEN_RE.test(raw);
  }
  const key = trimOwsEnd(raw.slice(0, eq));
  const rest = stripLeadingOws(raw.slice(eq + 1));
  return TOKEN_RE.test(key) && isBaggageValue(rest);
}

function isValidListMember(raw: string): boolean {
  const segments = raw.split(';');
  const kv = segments[0];
  const eq = kv.indexOf('=');
  if (eq === -1) return false;
  const key = trimOwsEnd(kv.slice(0, eq));
  if (!TOKEN_RE.test(key)) return false;
  const value = trimOws(kv.slice(eq + 1));
  if (!isBaggageValue(value)) return false;
  for (let i = 1; i < segments.length; i += 1) {
    if (!isValidProperty(trimOws(segments[i]))) return false;
  }
  return true;
}

export function isValidW3CBaggage(raw: string): boolean {
  if (raw.length === 0 || raw.length > BAGGAGE_MAX_BYTES) return false;
  const members = raw.split(',');
  if (members.length > BAGGAGE_MAX_MEMBERS) return false;
  for (const member of members) {
    const trimmed = trimOws(member);
    if (trimmed.length === 0) return false;
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
        if (sampledRaw) {
          span.setAttribute(ATTR_PARENT_SAMPLED, sampledRaw === '1');
        }
      }
    }

    if (baggage && isValidW3CBaggage(baggage)) {
      span.setAttribute(ATTR_BAGGAGE, baggage.slice(0, 1024));
    }
  } catch {}
  next();
}

export const __test = { SENTRY_TRACE_RE, HEADER_SENTRY_TRACE, HEADER_BAGGAGE, isValidW3CBaggage };
