import {
  hashEmail,
  REDACTED,
  scrubEvent,
  shouldDropBreadcrumb,
  type ScrubbableBreadcrumb,
  type ScrubbableEvent,
} from '@shared/observability/sentry-scrubber';

/**
 * Factory — minimal event with overridable sections.
 * @param overrides
 */
const makeEvent = (overrides: Partial<ScrubbableEvent> = {}): ScrubbableEvent => ({
  request: { headers: {}, data: {}, url: 'https://api.example.com/' },
  user: undefined,
  extra: undefined,
  ...overrides,
});

/**
 * Factory — minimal breadcrumb for category:http with overridable data.
 * @param overrides
 */
const makeBreadcrumb = (overrides: Partial<ScrubbableBreadcrumb> = {}): ScrubbableBreadcrumb => ({
  category: 'http',
  data: { url: 'https://api.example.com/ping' },
  ...overrides,
});

describe('sentry-scrubber — scrubEvent', () => {
  describe('request.headers', () => {
    const cases: { header: string; value: string; expectRedacted: boolean }[] = [
      { header: 'authorization', value: 'Bearer abc.def.ghi', expectRedacted: true },
      { header: 'Authorization', value: 'Bearer abc.def.ghi', expectRedacted: true },
      { header: 'cookie', value: 'session=xyz', expectRedacted: true },
      { header: 'x-api-key', value: 'k_live_123', expectRedacted: true },
      { header: 'X-Auth-Token', value: 't_abc', expectRedacted: true },
      { header: 'user-agent', value: 'curl/8.0', expectRedacted: false },
      { header: 'accept', value: 'application/json', expectRedacted: false },
    ];

    it.each(cases)(
      'header "$header" redacted=$expectRedacted',
      ({ header, value, expectRedacted }) => {
        const event = makeEvent({ request: { headers: { [header]: value } } });
        const scrubbed = scrubEvent(event);
        const out = scrubbed.request?.headers?.[header];
        expect(out).toBe(expectRedacted ? REDACTED : value);
      },
    );
  });

  describe('request.data body fields', () => {
    const cases: { key: string; expectRedacted: boolean }[] = [
      { key: 'password', expectRedacted: true },
      { key: 'newPassword', expectRedacted: true },
      { key: 'accessToken', expectRedacted: true },
      { key: 'refreshToken', expectRedacted: true },
      { key: 'apiKey', expectRedacted: true },
      { key: 'api_key', expectRedacted: true },
      { key: 'api-key', expectRedacted: true },
      { key: 'clientSecret', expectRedacted: true },
      { key: 'email', expectRedacted: false },
      { key: 'name', expectRedacted: false },
    ];

    it.each(cases)('body key "$key" redacted=$expectRedacted', ({ key, expectRedacted }) => {
      const event = makeEvent({ request: { data: { [key]: 'sensitive-value' } } });
      const scrubbed = scrubEvent(event);
      const data = scrubbed.request?.data as Record<string, unknown>;
      expect(data[key]).toBe(expectRedacted ? REDACTED : 'sensitive-value');
    });

    it('scrubs nested sensitive keys recursively', () => {
      const event = makeEvent({
        request: {
          data: {
            user: { email: 'e@x.com', password: 'hunter2' },
            auth: { refreshToken: 'r_abc' },
          },
        },
      });
      const scrubbed = scrubEvent(event);
      const data = scrubbed.request?.data as {
        user: { email: string; password: string };
        auth: { refreshToken: string };
      };
      expect(data.user.email).toBe('e@x.com');
      expect(data.user.password).toBe(REDACTED);
      expect(data.auth.refreshToken).toBe(REDACTED);
    });

    it('scrubs arrays of objects', () => {
      const event = makeEvent({
        request: {
          data: { items: [{ password: 'p1' }, { password: 'p2' }] },
        },
      });
      const scrubbed = scrubEvent(event);
      const data = scrubbed.request?.data as { items: { password: string }[] };
      expect(data.items[0].password).toBe(REDACTED);
      expect(data.items[1].password).toBe(REDACTED);
    });
  });

  describe('request.url query string', () => {
    it('strips token= value from query string', () => {
      const event = makeEvent({ request: { url: 'https://api.example.com/x?token=secret&ok=1' } });
      const scrubbed = scrubEvent(event);
      expect(scrubbed.request?.url).toBe(`https://api.example.com/x?token=${REDACTED}&ok=1`);
    });

    it('strips password= value from query string', () => {
      const event = makeEvent({ request: { url: 'https://api.example.com/?password=p&x=1' } });
      const scrubbed = scrubEvent(event);
      expect(scrubbed.request?.url).toBe(`https://api.example.com/?password=${REDACTED}&x=1`);
    });

    it('leaves URL untouched when no sensitive keys', () => {
      const event = makeEvent({ request: { url: 'https://api.example.com/x?page=2' } });
      const scrubbed = scrubEvent(event);
      expect(scrubbed.request?.url).toBe('https://api.example.com/x?page=2');
    });

    it('leaves URL untouched when no query string', () => {
      const event = makeEvent({ request: { url: 'https://api.example.com/health' } });
      const scrubbed = scrubEvent(event);
      expect(scrubbed.request?.url).toBe('https://api.example.com/health');
    });
  });

  describe('user.email fingerprinting', () => {
    it('replaces email with 8-char sha256 fingerprint', () => {
      const event = makeEvent({ user: { email: 'alice@example.com' } });
      const scrubbed = scrubEvent(event);
      expect(scrubbed.user?.email).toBeUndefined();
      expect((scrubbed.user as Record<string, unknown>).email_hash).toBe(
        hashEmail('alice@example.com'),
      );
      expect(((scrubbed.user as Record<string, unknown>).email_hash as string).length).toBe(8);
    });

    it('preserves existing user.id when present', () => {
      const event = makeEvent({ user: { id: 'user-123', email: 'bob@example.com' } });
      const scrubbed = scrubEvent(event);
      expect(scrubbed.user?.id).toBe('user-123');
      expect(scrubbed.user?.email).toBeUndefined();
    });

    it('leaves user untouched when no email', () => {
      const event = makeEvent({ user: { id: 'user-123' } });
      const scrubbed = scrubEvent(event);
      expect(scrubbed.user?.id).toBe('user-123');
    });
  });

  describe('extra payload', () => {
    it('redacts sensitive keys in extra.body', () => {
      const event = makeEvent({ extra: { body: { password: 'x', note: 'ok' } } });
      const scrubbed = scrubEvent(event);
      const body = (scrubbed.extra as { body: Record<string, unknown> }).body;
      expect(body.password).toBe(REDACTED);
      expect(body.note).toBe('ok');
    });

    it('redacts sensitive keys in extra.payload', () => {
      const event = makeEvent({ extra: { payload: { refreshToken: 'r' } } });
      const scrubbed = scrubEvent(event);
      const payload = (scrubbed.extra as { payload: Record<string, unknown> }).payload;
      expect(payload.refreshToken).toBe(REDACTED);
    });
  });
});

describe('sentry-scrubber — shouldDropBreadcrumb', () => {
  const dropCases: string[] = [
    'https://api.example.com/auth/login',
    'https://api.example.com/v1/auth/register',
    'https://api.example.com/auth/reset-password',
    'https://api.example.com/auth/change-password',
  ];

  it.each(dropCases)('drops http breadcrumb for "%s"', (url) => {
    expect(shouldDropBreadcrumb(makeBreadcrumb({ data: { url } }))).toBe(true);
  });

  it('keeps http breadcrumb for non-auth URL', () => {
    expect(
      shouldDropBreadcrumb(makeBreadcrumb({ data: { url: 'https://api.example.com/museums' } })),
    ).toBe(false);
  });

  it('keeps non-http breadcrumb even when url matches', () => {
    expect(
      shouldDropBreadcrumb({
        category: 'navigation',
        data: { url: 'https://api.example.com/auth/login' },
      }),
    ).toBe(false);
  });

  it('keeps breadcrumb when no url present', () => {
    expect(shouldDropBreadcrumb({ category: 'http', data: {} })).toBe(false);
  });
});
