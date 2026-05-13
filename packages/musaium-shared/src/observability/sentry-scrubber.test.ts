/**
 * Golden-input / golden-output identity test for the canonical Sentry scrubber.
 *
 * Any future regression that changes WHAT the scrubber redacts will flip this
 * test — including silent regex tweaks, a forgotten field, or a recursion-depth
 * bug. Pair this with the `sentry-scrubber-parity.mjs` sentinel which guards
 * against per-app reimplementation.
 *
 * Runs under `node --test`. Stays SDK-free.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  REDACTED,
  scrubEvent,
  scrubHeaders,
  scrubRecord,
  scrubUrl,
  shouldDropBreadcrumb,
  SENSITIVE_BREADCRUMB_PATHS,
  SENSITIVE_FIELD_REGEX,
  SENSITIVE_HEADER_REGEX,
  SENSITIVE_QUERY_KEYS,
} from './sentry-scrubber.ts';
import type {
  ScrubbableBreadcrumb,
  ScrubbableEvent,
  ScrubberDeps,
} from './sentry-scrubber.ts';

/**
 * Deterministic stub — never calls real crypto. The host injects either Node
 * crypto SHA-256 (backend) or a 32-bit fold (FE/Web) in production; the
 * scrubber itself only requires determinism, which this stub provides.
 */
const stubDeps: ScrubberDeps = {
  hashEmail: (email) => (email ? `H_${email.length.toString(16).padStart(2, '0')}` : undefined),
};

describe('constants are frozen / well-formed', () => {
  it('SENSITIVE_HEADER_REGEX matches expected headers (case-insensitive)', () => {
    assert.equal(SENSITIVE_HEADER_REGEX.test('Authorization'), true);
    assert.equal(SENSITIVE_HEADER_REGEX.test('cookie'), true);
    assert.equal(SENSITIVE_HEADER_REGEX.test('X-API-Key'), true);
    assert.equal(SENSITIVE_HEADER_REGEX.test('x-auth-token'), true);
    assert.equal(SENSITIVE_HEADER_REGEX.test('user-agent'), false);
    assert.equal(SENSITIVE_HEADER_REGEX.test('content-type'), false);
  });

  it('SENSITIVE_FIELD_REGEX matches expected body keys (case-insensitive)', () => {
    assert.equal(SENSITIVE_FIELD_REGEX.test('password'), true);
    assert.equal(SENSITIVE_FIELD_REGEX.test('newPassword'), true);
    assert.equal(SENSITIVE_FIELD_REGEX.test('accessToken'), true);
    assert.equal(SENSITIVE_FIELD_REGEX.test('refreshToken'), true);
    assert.equal(SENSITIVE_FIELD_REGEX.test('clientSecret'), true);
    assert.equal(SENSITIVE_FIELD_REGEX.test('apiKey'), true);
    assert.equal(SENSITIVE_FIELD_REGEX.test('api_key'), true);
    assert.equal(SENSITIVE_FIELD_REGEX.test('api-key'), true);
    assert.equal(SENSITIVE_FIELD_REGEX.test('email'), false);
    assert.equal(SENSITIVE_FIELD_REGEX.test('name'), false);
  });

  it('SENSITIVE_QUERY_KEYS contents are exactly the audited set', () => {
    assert.deepEqual(
      [...SENSITIVE_QUERY_KEYS].sort(),
      ['access_token', 'api_key', 'apikey', 'password', 'refresh_token', 'secret', 'token'],
    );
  });

  it('SENSITIVE_BREADCRUMB_PATHS contents are exactly the audited set', () => {
    assert.deepEqual(
      [...SENSITIVE_BREADCRUMB_PATHS].sort(),
      [
        '/auth/change-password',
        '/auth/login',
        '/auth/register',
        '/auth/reset-password',
      ],
    );
  });
});

describe('scrubHeaders', () => {
  it('redacts sensitive headers, keeps innocuous ones', () => {
    const input = {
      Authorization: 'Bearer abc',
      cookie: 'session=xyz',
      'x-api-key': 'k_live_1',
      'X-Auth-Token': 't_1',
      'user-agent': 'curl/8',
      accept: 'application/json',
    };
    const out = scrubHeaders(input);
    assert.deepEqual(out, {
      Authorization: REDACTED,
      cookie: REDACTED,
      'x-api-key': REDACTED,
      'X-Auth-Token': REDACTED,
      'user-agent': 'curl/8',
      accept: 'application/json',
    });
  });
});

describe('scrubRecord', () => {
  it('redacts nested sensitive keys, walks arrays', () => {
    const input = {
      email: 'alice@example.com',
      password: 'hunter2',
      nested: { apiKey: 'k', clientSecret: 's', deeper: { refreshToken: 'r' } },
      items: [{ password: 'p1' }, { token: 't1', label: 'ok' }],
    };
    const out = scrubRecord(input);
    assert.deepEqual(out, {
      email: 'alice@example.com',
      password: REDACTED,
      nested: { apiKey: REDACTED, clientSecret: REDACTED, deeper: { refreshToken: REDACTED } },
      items: [{ password: REDACTED }, { token: REDACTED, label: 'ok' }],
    });
  });

  it('passes through primitives and null', () => {
    assert.equal(scrubRecord('hello'), 'hello');
    assert.equal(scrubRecord(42), 42);
    assert.equal(scrubRecord(null), null);
    assert.equal(scrubRecord(undefined), undefined);
  });
});

describe('scrubUrl', () => {
  it('redacts known sensitive query keys, keeps the rest', () => {
    assert.equal(
      scrubUrl('https://api.example.com/x?token=secret&ok=1&password=p&page=2'),
      `https://api.example.com/x?token=${REDACTED}&ok=1&password=${REDACTED}&page=2`,
    );
  });

  it('returns the URL unchanged when no query string', () => {
    assert.equal(scrubUrl('https://api.example.com/health'), 'https://api.example.com/health');
  });

  it('returns the URL unchanged when no sensitive keys', () => {
    assert.equal(scrubUrl('https://api.example.com/?page=2'), 'https://api.example.com/?page=2');
  });
});

describe('scrubEvent — golden fixture', () => {
  // Single comprehensive fixture exercising every code path. The expected
  // output below is the GOLDEN that any future regression will diff against.
  const goldenInput: ScrubbableEvent = {
    request: {
      headers: {
        Authorization: 'Bearer xyz',
        cookie: 'session=abc',
        'x-api-key': 'k_live_1',
        'x-auth-token': 't_2',
        'x-musaium-session': 'should-NOT-be-redacted', // not in regex
        'user-agent': 'curl/8',
        accept: 'application/json',
      },
      data: {
        email: 'carol@example.com',
        password: 'hunter2',
        nested: { apiKey: 'k_live', clientSecret: 's_2', innocuous: 'ok' },
        items: [{ password: 'p1' }, { token: 't1' }],
      },
      url: 'https://api.example.com/x?token=secret&password=p&page=2&access_token=at&refresh_token=rt',
      query_string: 'left-untouched',
    },
    user: { email: 'dave@example.com', username: 'dave' },
    extra: { body: { password: 'x', note: 'ok' }, payload: { refreshToken: 'r' } },
    contexts: { app: { app_name: 'musaium' } },
  };

  const goldenOutput: ScrubbableEvent = {
    request: {
      headers: {
        Authorization: REDACTED,
        cookie: REDACTED,
        'x-api-key': REDACTED,
        'x-auth-token': REDACTED,
        'x-musaium-session': 'should-NOT-be-redacted',
        'user-agent': 'curl/8',
        accept: 'application/json',
      },
      data: {
        email: 'carol@example.com',
        password: REDACTED,
        nested: { apiKey: REDACTED, clientSecret: REDACTED, innocuous: 'ok' },
        items: [{ password: REDACTED }, { token: REDACTED }],
      },
      url: `https://api.example.com/x?token=${REDACTED}&password=${REDACTED}&page=2&access_token=${REDACTED}&refresh_token=${REDACTED}`,
      query_string: 'left-untouched',
    },
    user: {
      // raw email gone, id stamped from fingerprint, email_hash added
      username: 'dave',
      id: 'H_10',
      email_hash: 'H_10',
    },
    extra: { body: { password: REDACTED, note: 'ok' }, payload: { refreshToken: REDACTED } },
    contexts: { app: { app_name: 'musaium' } },
  };

  it('produces the expected scrubbed event for the canonical fixture', () => {
    const out = scrubEvent(goldenInput, stubDeps);
    assert.deepEqual(out, goldenOutput);
  });

  it('does NOT mutate the input event', () => {
    const inputCopy = JSON.parse(JSON.stringify(goldenInput));
    scrubEvent(goldenInput, stubDeps);
    assert.deepEqual(goldenInput, inputCopy);
  });

  it('preserves an existing user.id over the fingerprint', () => {
    const input: ScrubbableEvent = { user: { id: 'user-123', email: 'bob@example.com' } };
    const out = scrubEvent(input, stubDeps);
    assert.equal(out.user?.id, 'user-123');
    assert.equal(out.user?.email, undefined);
    assert.equal((out.user as Record<string, unknown>).email_hash, stubDeps.hashEmail('bob@example.com'));
  });

  it('leaves user untouched when no email present', () => {
    const input: ScrubbableEvent = { user: { id: 'user-123' } };
    const out = scrubEvent(input, stubDeps);
    assert.deepEqual(out.user, { id: 'user-123' });
  });
});

describe('shouldDropBreadcrumb', () => {
  const dropUrls: string[] = [
    'https://api.example.com/auth/login',
    'https://api.example.com/v1/auth/register',
    'https://api.example.com/auth/reset-password',
    'https://api.example.com/auth/change-password',
  ];

  for (const url of dropUrls) {
    it(`drops http breadcrumb for "${url}"`, () => {
      const crumb: ScrubbableBreadcrumb = { category: 'http', data: { url } };
      assert.equal(shouldDropBreadcrumb(crumb), true);
    });
  }

  it('keeps http breadcrumb for non-auth URL', () => {
    const crumb: ScrubbableBreadcrumb = {
      category: 'http',
      data: { url: 'https://api.example.com/museums' },
    };
    assert.equal(shouldDropBreadcrumb(crumb), false);
  });

  it('keeps non-http breadcrumb even when url matches', () => {
    const crumb: ScrubbableBreadcrumb = {
      category: 'navigation',
      data: { url: 'https://api.example.com/auth/login' },
    };
    assert.equal(shouldDropBreadcrumb(crumb), false);
  });

  it('keeps breadcrumb when no url present', () => {
    const crumb: ScrubbableBreadcrumb = { category: 'http', data: {} };
    assert.equal(shouldDropBreadcrumb(crumb), false);
  });
});
