import { logger } from '@shared/logger/logger';

describe('logger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs info as JSON with level, message, and timestamp', () => {
    logger.info('test_info');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.level).toBe('info');
    expect(output.message).toBe('test_info');
    expect(new Date(output.timestamp).getTime()).not.toBeNaN();
    expect(output.service).toBe('museum-backend');
  });

  it('logs info with context', () => {
    logger.info('test_info', { requestId: 'r1', extra: 42 });

    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.requestId).toBe('r1');
    expect(output.extra).toBe(42);
  });

  it('logs warn to console.warn', () => {
    logger.warn('test_warn');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(output.level).toBe('warn');
    expect(output.message).toBe('test_warn');
  });

  it('logs warn with context', () => {
    logger.warn('test_warn', { key: 'value' });

    const output = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(output.key).toBe('value');
  });

  it('logs error to console.error', () => {
    logger.error('test_error');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(output.level).toBe('error');
    expect(output.message).toBe('test_error');
  });

  it('logs error with context', () => {
    logger.error('test_error', { error: 'something broke' });

    const output = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(output.error).toBe('something broke');
  });

  it('includes default fields in all log levels', () => {
    logger.info('test');
    logger.warn('test');
    logger.error('test');

    for (const spy of [logSpy, warnSpy, errorSpy]) {
      const output = JSON.parse(spy.mock.calls[0][0]);
      expect(output.service).toBe('museum-backend');
      expect(typeof output.environment).toBe('string');
      expect(typeof output.version).toBe('string');
      expect(typeof output.hostname).toBe('string');
    }
  });

  it('logs without context (undefined context branch)', () => {
    logger.info('no_context');

    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.message).toBe('no_context');
    // Should only have default fields, no extra context keys
  });

  // Kills L13 ObjectLiteral → {}: an empty defaultFields strips every literal
  // value out of the emitted JSON. Asserting each field by exact value (not
  // typeof) makes the mutation observable on the first log call.
  it('emits service="museum-backend" verbatim (not just a string-typed value)', () => {
    logger.info('x');
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.service).toBe('museum-backend');
  });

  it('emits hostname matching os.hostname() exactly', () => {
    // Lazy-require os to avoid hoisting issues; both runtime and test use the
    // same Node binary so os.hostname() is identical.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- minimal local require, hostname is invariant across the test
    const { hostname } = require('node:os') as typeof import('node:os');
    logger.info('x');
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.hostname).toBe(hostname());
  });
});

// ---------------------------------------------------------------------------
// Cycle 10 (A-02 MEDIUM) — central log redaction of URLs carrying secrets.
//
// CONTRACT (what GREEN delivers): logger.format() MUST run the context through
// a redaction pass BEFORE JSON.stringify → stdout. URLs with sensitive query
// params (presigned S3 `X-Amz-Signature`/`X-Amz-Credential`/`X-Amz-Security-Token`,
// `?token=`, `?code=`, `?access_token=`, `?secret=`, `?sig=`/`signature=`) are
// masked to `[redacted]` while host + path + non-sensitive params survive.
// Sensitive KEYS (password/token/secret/api_key/refresh) are redacted regardless
// of value type. Public URLs and non-URL contexts pass through unchanged. The
// redaction is recursive (nested objects/arrays), idempotent, and fail-safe
// (never throws — emits a marker instead).
//
// HONESTY (UFR-013): these tests prove the CAPABILITY of the central logger to
// redact a URL it is explicitly handed. They do NOT claim any current call-site
// leaks — the spec verified the seed examples (auth reset, S3) are already sane
// (those secrets are simply never logged). The fix is a structural guard.
//
// RED STATE: every redaction case below FAILS today — logger.ts:25-31 emits the
// raw context verbatim with no scrubbing. The no-over-masking cases (T4/T5/T8/T13)
// already pass and serve as regression locks.
// ---------------------------------------------------------------------------
describe('logger — URL/secret redaction (cycle 10, A-02)', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // Captures the raw string handed to the spied console method and returns both
  // the parsed JSON and the raw string (substring assertions on the raw line are
  // the strongest "no secret leaked anywhere" check).
  const lastCall = (spy: jest.SpyInstance): { raw: string; json: Record<string, unknown> } => {
    const calls = spy.mock.calls;
    const raw = calls[calls.length - 1][0] as string;
    return { raw, json: JSON.parse(raw) as Record<string, unknown> };
  };

  it('T1 — redacts presigned S3 X-Amz-Signature, keeps X-Amz-Expires + host/path', () => {
    logger.info('s3_presigned', {
      url: 'https://bucket.s3.amazonaws.com/key.jpg?X-Amz-Signature=ABC123&X-Amz-Expires=900',
    });
    const { raw, json } = lastCall(logSpy);
    expect(raw).not.toContain('ABC123');
    expect(json.url).toContain('X-Amz-Signature=[redacted]');
    expect(json.url).toContain('X-Amz-Expires=900');
    expect(json.url).toContain('https://bucket.s3.amazonaws.com/key.jpg');
  });

  it('T1b — redacts X-Amz-Credential and X-Amz-Security-Token presigned params', () => {
    logger.info('s3_presigned', {
      url: 'https://b.s3.amazonaws.com/o?X-Amz-Credential=AKIA%2F20260526&X-Amz-Security-Token=FQoToken&X-Amz-Date=20260526T000000Z',
    });
    const { raw, json } = lastCall(logSpy);
    expect(raw).not.toContain('AKIA%2F20260526');
    expect(raw).not.toContain('FQoToken');
    expect(json.url).toContain('X-Amz-Credential=[redacted]');
    expect(json.url).toContain('X-Amz-Security-Token=[redacted]');
    expect(json.url).toContain('X-Amz-Date=20260526T000000Z');
  });

  it('T2 — redacts magic-link ?token=', () => {
    logger.warn('verify_link', {
      url: 'https://app.musaium.com/fr/verify-email?token=SECRETVALUE',
    });
    const { raw, json } = lastCall(warnSpy);
    expect(raw).not.toContain('SECRETVALUE');
    expect(json.url).toContain('token=[redacted]');
    expect(json.url).toContain('https://app.musaium.com/fr/verify-email');
  });

  it('T3 — redacts reset ?code=', () => {
    logger.info('reset_link', { url: 'https://app.musaium.com/fr/reset-password?code=ABCDRESET' });
    const { raw, json } = lastCall(logSpy);
    expect(raw).not.toContain('ABCDRESET');
    expect(json.url).toContain('code=[redacted]');
  });

  it('T3b — redacts ?sig= and ?signature= signature params', () => {
    logger.info('signed', { url: 'https://cdn.musaium.com/a?sig=DEADBEEF&signature=CAFEBABE&v=1' });
    const { raw, json } = lastCall(logSpy);
    expect(raw).not.toContain('DEADBEEF');
    expect(raw).not.toContain('CAFEBABE');
    expect(json.url).toContain('sig=[redacted]');
    expect(json.url).toContain('signature=[redacted]');
    expect(json.url).toContain('v=1');
  });

  it('T4 — leaves a public URL with no query untouched (no over-masking)', () => {
    logger.info('public_url', { url: 'https://fr.wikipedia.org/wiki/Joconde' });
    const { json } = lastCall(logSpy);
    expect(json.url).toBe('https://fr.wikipedia.org/wiki/Joconde');
  });

  it('T5 — leaves a URL with only non-sensitive query params untouched', () => {
    logger.info('public_url', { url: 'https://example.org/page?lang=fr&page=2' });
    const { json } = lastCall(logSpy);
    expect(json.url).toBe('https://example.org/page?lang=fr&page=2');
  });

  it('T6 — redacts a URL nested inside an object (recursive)', () => {
    logger.info('nested', { payload: { href: 'https://x.tld/y?token=ZNESTED' } });
    const { raw, json } = lastCall(logSpy);
    expect(raw).not.toContain('ZNESTED');
    const payload = json.payload as { href: string };
    expect(payload.href).toContain('token=[redacted]');
  });

  it('T7 — redacts URLs inside an array, leaving the public one intact', () => {
    logger.info('list', { urls: ['https://a.tld/b?secret=QSECRET', 'https://a.tld/c?public=1'] });
    const { raw, json } = lastCall(logSpy);
    expect(raw).not.toContain('QSECRET');
    const urls = json.urls as string[];
    expect(urls[0]).toContain('secret=[redacted]');
    expect(urls[1]).toBe('https://a.tld/c?public=1');
  });

  it('T8 — leaves a no-URL context unchanged (no over-masking)', () => {
    logger.info('http_request', { requestId: 'r1', statusCode: 500, latencyMs: 42, userId: 'u1' });
    const { json } = lastCall(logSpy);
    expect(json.requestId).toBe('r1');
    expect(json.statusCode).toBe(500);
    expect(json.latencyMs).toBe(42);
    expect(json.userId).toBe('u1');
  });

  it('T9 — scraper end-to-end: redacts ?token= via the central logger, keeps jobId + host/path', () => {
    logger.warn('extraction_job_start', {
      url: 'https://example.org/page?token=LEAKVALUE',
      jobId: 'j1',
    });
    const { raw, json } = lastCall(warnSpy);
    expect(raw).not.toContain('LEAKVALUE');
    expect(json.url).toContain('token=[redacted]');
    expect(json.url).toContain('https://example.org/page');
    expect(json.jobId).toBe('j1');
  });

  it('T10 — redacts sensitive KEYS even when the value is not a URL', () => {
    logger.warn('auth', { password: 'pw-plain', token: 'tk-plain', secret: 'sk-plain' });
    const { raw, json } = lastCall(warnSpy);
    expect(raw).not.toContain('pw-plain');
    expect(raw).not.toContain('tk-plain');
    expect(raw).not.toContain('sk-plain');
    expect(json.password).toBe('[redacted]');
    expect(json.token).toBe('[redacted]');
    expect(json.secret).toBe('[redacted]');
  });

  it('T11 — idempotent: re-logging an already-redacted URL changes nothing', () => {
    logger.info('once', { url: 'https://x.tld/y?token=ONCESECRET' });
    const firstUrl = lastCall(logSpy).json.url as string;
    expect(firstUrl).toContain('token=[redacted]');

    logger.info('twice', { url: firstUrl });
    const secondUrl = lastCall(logSpy).json.url as string;
    expect(secondUrl).toBe(firstUrl);
  });

  it('T12 — fail-safe: a context with a throwing getter never throws, emits a marker, never the raw secret', () => {
    const hostile: Record<string, unknown> = { jobId: 'j2' };
    Object.defineProperty(hostile, 'url', {
      enumerable: true,
      get() {
        throw new Error('boom-from-getter-SECRETHIDDEN');
      },
    });

    expect(() => logger.error('hostile', hostile)).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    const { raw, json } = lastCall(errorSpy);
    expect(json.level).toBe('error');
    expect(json.message).toBe('hostile');
    expect(json.logContextRedactionFailed).toBe(true);
    // The raw failing payload must not leak through.
    expect(raw).not.toContain('SECRETHIDDEN');
  });

  it('T12b — fail-safe: a context carrying a non-serialisable BigInt never throws, emits a marker, never the raw value', () => {
    // Distinct path from T12: the getter-throw is caught INSIDE redactValue (so
    // redactLogContext's try/catch fires). A BigInt instead survives redactValue
    // untouched (it is neither string/array/object → returned as-is) and only
    // blows up later in `JSON.stringify`, which today lives OUTSIDE the fail-safe
    // try/catch (logger.ts:82-89). R6/NFR5 requires the logger to NEVER throw and
    // to emit the marker even for this serialisation-time failure.
    expect(() =>
      logger.error('hostile_bigint', { jobId: 'j3', balance: 9007199254740993n }),
    ).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    const { raw, json } = lastCall(errorSpy);
    expect(json.level).toBe('error');
    expect(json.message).toBe('hostile_bigint');
    expect(json.logContextRedactionFailed).toBe(true);
    // The raw un-serialisable digits must not leak through any fallback path.
    expect(raw).not.toContain('9007199254740993');
  });

  it('T13 — false-positive guard: free-text containing the word "token" is NOT mangled', () => {
    logger.info('search', { error: 'token expired', query: 'who painted the token bridge' });
    const { json } = lastCall(logSpy);
    expect(json.error).toBe('token expired');
    expect(json.query).toBe('who painted the token bridge');
  });

  it('T14 — redacts a relative/path-only URL value (?code=)', () => {
    logger.info('relative', { path: '/api/auth/x?code=YPATHCODE&keep=1' });
    const { raw, json } = lastCall(logSpy);
    expect(raw).not.toContain('YPATHCODE');
    expect(json.path).toContain('code=[redacted]');
    expect(json.path).toContain('keep=1');
  });
});

// Kills L13 ObjectLiteral, L14 StringLiteral, L15/L16 LogicalOperator, and
// L16 StringLiteral mutations on the static defaultFields object by
// re-evaluating the module under controlled process.env states.
describe('logger defaultFields under various env states', () => {
  /**
   * @param env
   * @param body
   */
  function withEnv(
    env: Record<string, string | undefined>,
    body: (out: Record<string, unknown>) => void,
  ): void {
    const prev = { ...process.env };
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic re-import to re-evaluate the module-level defaultFields with the env override active
        const fresh = require('@shared/logger/logger') as typeof import('@shared/logger/logger');
        const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
          fresh.logger.info('probe');
          const output = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
          body(output);
        } finally {
          spy.mockRestore();
        }
      });
    } finally {
      process.env = prev;
    }
  }

  it('uses NODE_ENV when set', () => {
    withEnv({ NODE_ENV: 'staging' }, (out) => {
      expect(out.environment).toBe('staging');
    });
  });

  it('falls back to "development" when NODE_ENV is unset', () => {
    withEnv({ NODE_ENV: undefined }, (out) => {
      expect(out.environment).toBe('development');
    });
  });

  it('uses APP_VERSION when set (takes precedence over npm_package_version)', () => {
    withEnv({ APP_VERSION: '9.9.9', npm_package_version: '7.7.7' }, (out) => {
      expect(out.version).toBe('9.9.9');
    });
  });

  it('falls back to npm_package_version when APP_VERSION is unset', () => {
    withEnv({ APP_VERSION: undefined, npm_package_version: '7.7.7' }, (out) => {
      expect(out.version).toBe('7.7.7');
    });
  });

  it('falls back to "unknown" when neither APP_VERSION nor npm_package_version are set', () => {
    withEnv({ APP_VERSION: undefined, npm_package_version: undefined }, (out) => {
      expect(out.version).toBe('unknown');
    });
  });

  it('emits service="museum-backend" even after module re-evaluation', () => {
    withEnv({}, (out) => {
      expect(out.service).toBe('museum-backend');
    });
  });
});
