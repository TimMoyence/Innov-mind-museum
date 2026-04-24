/**
 * Sentry PII scrubber — single source of truth for redaction logic.
 *
 * Kept Sentry-SDK-free so it can be unit-tested with plain objects and
 * reused across runtimes. Applied via `beforeSend` / `beforeBreadcrumb`
 * hooks in `sentry.ts`.
 */

import { createHash } from 'node:crypto';

/** Header names (case-insensitive) whose values must be redacted before leaving the app. */
const SENSITIVE_HEADER_REGEX = /^(authorization|cookie|x-api-key|x-auth-token)$/i;

/** Body / extra field names whose values must be redacted before leaving the app. */
const SENSITIVE_FIELD_REGEX = /password|token|secret|api[_-]?key|refresh/i;

/** Query-string keys whose values must be stripped from captured URLs. */
const SENSITIVE_QUERY_KEYS: ReadonlySet<string> = new Set(['token', 'password']);

/** Auth-adjacent paths where breadcrumb bodies could leak credentials. */
const SENSITIVE_BREADCRUMB_PATHS: readonly string[] = [
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/auth/change-password',
];

/** Replacement marker written in place of redacted values. */
export const REDACTED = '[redacted]';

/** Minimal shape of a Sentry event we read. Stays structural to avoid a hard SDK dep. */
export interface ScrubbableEvent {
  request?: {
    headers?: Record<string, unknown>;
    data?: unknown;
    url?: string;
    query_string?: unknown;
  };
  user?: {
    email?: string;
    id?: string;
    username?: string;
    [key: string]: unknown;
  };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
}

/** Minimal shape of a Sentry breadcrumb we read. */
export interface ScrubbableBreadcrumb {
  category?: string;
  data?: {
    url?: string;
    [key: string]: unknown;
  };
}

/** Hashes an email down to an 8-char fingerprint (sha256 hex, truncated). Returns `undefined` for empty input. */
export const hashEmail = (email: string): string | undefined => {
  if (!email) return undefined;
  return createHash('sha256').update(email).digest('hex').slice(0, 8);
};

/** Returns a copy of `headers` with sensitive values redacted. Non-object input is returned untouched. */
const scrubHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...headers };
  for (const key of Object.keys(out)) {
    if (SENSITIVE_HEADER_REGEX.test(key)) {
      out[key] = REDACTED;
    }
  }
  return out;
};

/** Recursively redacts values under sensitive keys. Arrays and nested objects are walked. */
const scrubRecord = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map((item) => scrubRecord(item));
  }
  if (input !== null && typeof input === 'object') {
    const src = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src)) {
      out[key] = SENSITIVE_FIELD_REGEX.test(key) ? REDACTED : scrubRecord(value);
    }
    return out;
  }
  return input;
};

/** Strips sensitive query-string values from a URL while preserving the rest. Invalid URLs are returned unchanged. */
const scrubUrl = (url: string): string => {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return url;
  const base = url.slice(0, qIndex);
  const qs = url.slice(qIndex + 1);
  const parts = qs.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1) return pair;
    const key = pair.slice(0, eq);
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      return `${key}=${REDACTED}`;
    }
    return pair;
  });
  return `${base}?${parts.join('&')}`;
};

/** Returns a copy of `request` with sensitive headers / data / URL fields scrubbed. */
const scrubRequest = (
  request: NonNullable<ScrubbableEvent['request']>,
): NonNullable<ScrubbableEvent['request']> => {
  const out = { ...request };
  if (out.headers && typeof out.headers === 'object') {
    out.headers = scrubHeaders(out.headers);
  }
  if (out.data && typeof out.data === 'object') {
    out.data = scrubRecord(out.data);
  }
  if (typeof out.url === 'string') {
    out.url = scrubUrl(out.url);
  }
  return out;
};

/** Returns a copy of `user` with the raw email removed, replaced by a stable fingerprint. */
const scrubUser = (
  user: NonNullable<ScrubbableEvent['user']>,
): NonNullable<ScrubbableEvent['user']> => {
  const out = { ...user };
  const fingerprint = hashEmail(out.email ?? '');
  delete out.email;
  if (fingerprint) {
    out.id = out.id ?? fingerprint;
    (out as Record<string, unknown>).email_hash = fingerprint;
  }
  return out;
};

/** Applies all scrubbing rules to a Sentry event in place (new object returned). */
export const scrubEvent = <T extends ScrubbableEvent>(event: T): T => {
  const next: T = { ...event };

  if (next.request) {
    next.request = scrubRequest(next.request);
  }

  if (next.user?.email) {
    next.user = scrubUser(next.user);
  }

  if (next.extra && typeof next.extra === 'object') {
    next.extra = scrubRecord(next.extra) as Record<string, unknown>;
  }

  return next;
};

/** Returns `true` when the breadcrumb should be dropped (auth-adjacent HTTP call). */
export const shouldDropBreadcrumb = (breadcrumb: ScrubbableBreadcrumb): boolean => {
  if (breadcrumb.category !== 'http') return false;
  const url = breadcrumb.data?.url;
  if (typeof url !== 'string') return false;
  return SENSITIVE_BREADCRUMB_PATHS.some((path) => url.includes(path));
};
