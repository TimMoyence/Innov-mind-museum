import { describe, expect, it } from 'vitest';

import {
  hashEmail,
  REDACTED,
  scrubEvent,
  shouldDropBreadcrumb,
  type ScrubbableBreadcrumb,
  type ScrubbableEvent,
} from './sentry-scrubber';

/** Factory — fake Sentry event with overridable sections. */
const makeFakeEvent = (overrides: Partial<ScrubbableEvent> = {}): ScrubbableEvent => ({
  request: { headers: {}, data: {}, url: 'https://app.musaium.example/' },
  ...overrides,
});

/** Factory — fake Sentry breadcrumb defaulting to category:http. */
const makeFakeBreadcrumb = (
  overrides: Partial<ScrubbableBreadcrumb> = {},
): ScrubbableBreadcrumb => ({
  category: 'http',
  data: { url: 'https://app.musaium.example/ping' },
  ...overrides,
});

describe('web sentry-scrubber', () => {
  it('redacts Authorization header value', () => {
    const event = makeFakeEvent({
      request: { headers: { Authorization: 'Bearer xyz', 'x-trace-id': 'trace-1' } },
    });
    const out = scrubEvent(event);
    expect(out.request?.headers?.Authorization).toBe(REDACTED);
    expect(out.request?.headers?.['x-trace-id']).toBe('trace-1');
  });

  it('redacts password inside request.data recursively', () => {
    const event = makeFakeEvent({
      request: {
        data: {
          email: 'carol@example.com',
          password: 'hunter2',
          nested: { apiKey: 'k_live_1', clientSecret: 's_1' },
        },
      },
    });
    const out = scrubEvent(event);
    const data = out.request?.data as {
      email: string;
      password: string;
      nested: { apiKey: string; clientSecret: string };
    };
    expect(data.email).toBe('carol@example.com');
    expect(data.password).toBe(REDACTED);
    expect(data.nested.apiKey).toBe(REDACTED);
    expect(data.nested.clientSecret).toBe(REDACTED);
  });

  it('drops http breadcrumb for /auth/login URL', () => {
    const crumb = makeFakeBreadcrumb({
      data: { url: 'https://app.musaium.example/auth/login' },
    });
    expect(shouldDropBreadcrumb(crumb)).toBe(true);
  });

  it('replaces user.email with 8-char fingerprint', () => {
    const event = makeFakeEvent({ user: { email: 'dave@example.com' } });
    const out = scrubEvent(event);
    expect(out.user?.email).toBeUndefined();
    const hash = (out.user as Record<string, unknown>).email_hash as string;
    expect(hash).toBe(hashEmail('dave@example.com'));
    expect(hash.length).toBe(8);
  });

  it('strips token= value from request.url query string', () => {
    const event = makeFakeEvent({
      request: { url: 'https://app.musaium.example/callback?token=leaky&next=/home' },
    });
    const out = scrubEvent(event);
    expect(out.request?.url).toBe(
      `https://app.musaium.example/callback?token=${REDACTED}&next=/home`,
    );
  });
});
