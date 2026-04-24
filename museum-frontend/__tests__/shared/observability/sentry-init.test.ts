/**
 * Tests for the mobile Sentry PII scrubber.
 *
 * The scrubber is imported directly (Sentry-SDK-free) so we don't need to mock
 * `@sentry/react-native` here. DRY factories keep event shapes consistent.
 */

import {
  hashEmail,
  REDACTED,
  scrubEvent,
  shouldDropBreadcrumb,
  type ScrubbableBreadcrumb,
  type ScrubbableEvent,
} from '@/shared/observability/sentry-scrubber';

/** Factory — fake Sentry event with overridable sections. */
const makeFakeEvent = (overrides: Partial<ScrubbableEvent> = {}): ScrubbableEvent => ({
  request: { headers: {}, data: {}, url: 'https://api.musaium.example/' },
  ...overrides,
});

/** Factory — fake Sentry breadcrumb defaulting to category:http. */
const makeFakeBreadcrumb = (
  overrides: Partial<ScrubbableBreadcrumb> = {},
): ScrubbableBreadcrumb => ({
  category: 'http',
  data: { url: 'https://api.musaium.example/ping' },
  ...overrides,
});

describe('mobile sentry-scrubber — scrubEvent', () => {
  it('redacts Authorization header (case-insensitive)', () => {
    const event = makeFakeEvent({
      request: { headers: { Authorization: 'Bearer abc.def', 'user-agent': 'Musaium/1.0' } },
    });
    const out = scrubEvent(event);
    expect(out.request?.headers?.Authorization).toBe(REDACTED);
    expect(out.request?.headers?.['user-agent']).toBe('Musaium/1.0');
  });

  it('redacts password/token/secret in request.data recursively', () => {
    const event = makeFakeEvent({
      request: {
        data: {
          email: 'alice@example.com',
          password: 'hunter2',
          creds: { accessToken: 'at.abc', refreshToken: 'rt.xyz' },
        },
      },
    });
    const out = scrubEvent(event);
    const data = out.request?.data as {
      email: string;
      password: string;
      creds: { accessToken: string; refreshToken: string };
    };
    expect(data.email).toBe('alice@example.com');
    expect(data.password).toBe(REDACTED);
    expect(data.creds.accessToken).toBe(REDACTED);
    expect(data.creds.refreshToken).toBe(REDACTED);
  });

  it('strips token= value from request.url query string', () => {
    const event = makeFakeEvent({
      request: { url: 'https://api.musaium.example/x?token=secret&page=1' },
    });
    const out = scrubEvent(event);
    expect(out.request?.url).toBe(`https://api.musaium.example/x?token=${REDACTED}&page=1`);
  });

  it('replaces user.email with an 8-char fingerprint', () => {
    const event = makeFakeEvent({ user: { email: 'bob@example.com' } });
    const out = scrubEvent(event);
    expect(out.user?.email).toBeUndefined();
    const hash = (out.user as Record<string, unknown>).email_hash as string;
    expect(hash).toBe(hashEmail('bob@example.com'));
    expect(hash.length).toBe(8);
  });

  it('redacts sensitive keys in extra.body and extra.payload', () => {
    const event = makeFakeEvent({
      extra: {
        body: { password: 'x', note: 'ok' },
        payload: { refreshToken: 'r' },
      },
    });
    const out = scrubEvent(event);
    const extra = out.extra as {
      body: { password: string; note: string };
      payload: { refreshToken: string };
    };
    expect(extra.body.password).toBe(REDACTED);
    expect(extra.body.note).toBe('ok');
    expect(extra.payload.refreshToken).toBe(REDACTED);
  });
});

describe('mobile sentry-scrubber — shouldDropBreadcrumb', () => {
  const authPaths: string[] = [
    '/auth/login',
    '/auth/register',
    '/auth/reset-password',
    '/auth/change-password',
  ];

  it.each(authPaths)('drops http breadcrumb containing "%s"', (path) => {
    const crumb = makeFakeBreadcrumb({ data: { url: `https://api.musaium.example${path}` } });
    expect(shouldDropBreadcrumb(crumb)).toBe(true);
  });

  it('keeps breadcrumb for safe URLs', () => {
    const crumb = makeFakeBreadcrumb({
      data: { url: 'https://api.musaium.example/museums' },
    });
    expect(shouldDropBreadcrumb(crumb)).toBe(false);
  });

  it('keeps non-http breadcrumbs even when URL matches', () => {
    const crumb: ScrubbableBreadcrumb = {
      category: 'navigation',
      data: { url: 'https://api.musaium.example/auth/login' },
    };
    expect(shouldDropBreadcrumb(crumb)).toBe(false);
  });
});
