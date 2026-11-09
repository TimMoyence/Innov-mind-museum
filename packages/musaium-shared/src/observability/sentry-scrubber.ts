
export const SENSITIVE_HEADER_REGEX = /^(authorization|cookie|x-api-key|x-auth-token)$/i;

export const SENSITIVE_FIELD_REGEX = /password|token|secret|api[_-]?key|refresh/i;

export const SENSITIVE_QUERY_KEYS: ReadonlySet<string> = new Set([
  'access_token',
  'api_key',
  'apikey',
  'code',
  'email',
  'password',
  'phone',
  'refresh_token',
  'secret',
  'sig',
  'signature',
  'state',
  'token',
  'x-amz-credential',
  'x-amz-security-token',
  'x-amz-signature',
]);

export const SENSITIVE_BREADCRUMB_PATHS: readonly string[] = [
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/auth/change-password',
];

export const REDACTED = '[redacted]';

export const hashEmail = (email: string): string | undefined => {
  if (!email) return undefined;
  let hash = 0xdeadbeef;
  for (let i = 0; i < email.length; i += 1) {
    hash = Math.imul(hash ^ email.charCodeAt(i), 2654435761);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
};

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
  tags?: Record<string, unknown>;
}

export interface ScrubbableBreadcrumb {
  category?: string;
  data?: {
    url?: string;
    [key: string]: unknown;
  };
}

export interface ScrubberDeps {
  hashEmail: (email: string) => string | undefined;
}

export const scrubHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...headers };
  for (const key of Object.keys(out)) {
    if (SENSITIVE_HEADER_REGEX.test(key)) {
      out[key] = REDACTED;
    }
  }
  return out;
};

export const scrubRecord = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map((item) => scrubRecord(item));
  }
  if (input !== null && typeof input === 'object') {
    const src = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src)) {
      if (SENSITIVE_FIELD_REGEX.test(key)) {
        out[key] = REDACTED;
      } else if (isUrlLikeValue(value)) {
        out[key] = scrubUrl(value);
      } else {
        out[key] = scrubRecord(value);
      }
    }
    return out;
  }
  return input;
};

export const isUrlLikeValue = (value: unknown): value is string =>
  typeof value === 'string' &&
  (value.includes('?') ||
    value.startsWith('/') ||
    value.startsWith('http://') ||
    value.startsWith('https://'));

export const scrubUrl = (url: string): string => {
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
  if (typeof out.query_string === 'string') {
    const rawQuery = out.query_string.replace(/^\?/, '');
    out.query_string = scrubUrl(`?${rawQuery}`).slice(1);
  }
  return out;
};

const scrubUser = (
  user: NonNullable<ScrubbableEvent['user']>,
  deps: ScrubberDeps,
): NonNullable<ScrubbableEvent['user']> => {
  const out = { ...user };
  const fingerprint = deps.hashEmail(out.email ?? '');
  delete out.email;
  if (fingerprint) {
    out.id = out.id ?? fingerprint;
    (out as Record<string, unknown>).email_hash = fingerprint;
  }
  return out;
};

export const scrubEvent = <T extends ScrubbableEvent>(event: T, deps: ScrubberDeps): T => {
  const next: T = { ...event };

  if (next.request) {
    next.request = scrubRequest(next.request);
  }

  if (next.user?.email) {
    next.user = scrubUser(next.user, deps);
  }

  if (next.extra && typeof next.extra === 'object') {
    next.extra = scrubRecord(next.extra) as Record<string, unknown>;
  }

  if (next.tags && typeof next.tags === 'object') {
    const scrubbedTags = scrubRecord(next.tags) as Record<string, unknown>;
    for (const [key, value] of Object.entries(scrubbedTags)) {
      if (SENSITIVE_HEADER_REGEX.test(key)) {
        scrubbedTags[key] = REDACTED;
        continue;
      }
      if (isUrlLikeValue(value)) {
        scrubbedTags[key] = scrubUrl(value);
      }
    }
    next.tags = scrubbedTags;
  }

  return next;
};

export const shouldDropBreadcrumb = (breadcrumb: ScrubbableBreadcrumb): boolean => {
  if (breadcrumb.category !== 'http') return false;
  const url = breadcrumb.data?.url;
  if (typeof url !== 'string') return false;
  return SENSITIVE_BREADCRUMB_PATHS.some((path) => url.includes(path));
};
