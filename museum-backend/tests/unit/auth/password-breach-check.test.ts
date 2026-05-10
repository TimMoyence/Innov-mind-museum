/**
 * F10 (2026-04-30) — HIBP Pwned Passwords k-anonymity client.
 *
 * Validates the SHA-1 prefix/suffix protocol, padded-entry filtering, fail-open
 * on transport errors, and the AppError thrown by `assertPasswordNotBreached`.
 *
 * Stryker hardening (2026-05-10) — kills 15 survivors on
 * src/shared/validation/password-breach-check.ts by asserting:
 *   - logger.warn event names + payload shape (hibp_unexpected_status,
 *     hibp_unavailable_failopen)
 *   - captureExceptionWithContext payload contract (component + mode strings)
 *   - exact HIBP error message format ("HIBP returned status N")
 *   - URL prefix + suffix matching ("AAAAA:" not just "AAAAA")
 *   - timeoutMs default (2000) vs explicit override paths
 *   - AbortController fires on synthetic timer expiry
 *   - User-Agent header value
 *   - assertPasswordNotBreached short-circuit when env flag disabled
 *   - AppError(PASSWORD_BREACHED) carries the verbatim user-facing message
 */
import crypto from 'node:crypto';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockCaptureException = jest.fn();
jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: (...args: unknown[]) => mockCaptureException(...args),
  isSentryEnabled: () => true,
}));

const mockPasswordBreachCheckEnabled = { value: true };
jest.mock('@src/config/env', () => ({
  __esModule: true,
  get env() {
    return {
      auth: {
        passwordBreachCheckEnabled: mockPasswordBreachCheckEnabled.value,
      },
    };
  },
}));

import { logger } from '@shared/logger/logger';
import {
  assertPasswordNotBreached,
  checkPasswordBreach,
} from '@shared/validation/password-breach-check';

const sha1Upper = (value: string): string =>
  crypto.createHash('sha1').update(value).digest('hex').toUpperCase();

const okResponse = (body: string): Response =>
  ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(body),
  }) as Response;

describe('F10 — checkPasswordBreach (HIBP k-anonymity)', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    (logger.warn as jest.Mock).mockClear();
    (logger.info as jest.Mock).mockClear();
    (logger.error as jest.Mock).mockClear();
    mockPasswordBreachCheckEnabled.value = true;
    jest.restoreAllMocks();
  });

  it('returns breached:false when the suffix is not in the response body', async () => {
    const password = 'unique-passphrase-not-in-corpus-' + Date.now();
    const fullHash = sha1Upper(password);
    const otherSuffix = 'A'.repeat(35);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(`${otherSuffix}:5\n`));

    const result = await checkPasswordBreach(password);

    expect(result).toEqual({ breached: false, count: 0, failOpen: false });
    expect(fullHash).toBeTruthy(); // sanity — no test pollution
  });

  it('returns breached:true with the count when the suffix appears in the response', async () => {
    const password = 'pwn3d-test-' + Date.now();
    const fullHash = sha1Upper(password);
    const suffix = fullHash.slice(5);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(`AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\n${suffix}:42\n`));

    const result = await checkPasswordBreach(password);

    expect(result).toEqual({ breached: true, count: 42, failOpen: false });
  });

  it('treats Add-Padding count=0 entries as not-breached', async () => {
    const password = 'padded-test';
    const fullHash = sha1Upper(password);
    const suffix = fullHash.slice(5);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(`${suffix}:0\n`));

    const result = await checkPasswordBreach(password);

    expect(result).toEqual({ breached: false, count: 0, failOpen: false });
  });

  it('fail-open with Sentry alert on HIBP non-2xx response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve(''),
    } as Response);

    const result = await checkPasswordBreach('whatever');

    expect(result).toEqual({ breached: false, count: 0, failOpen: true });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ component: 'password-breach-check', mode: 'fail-open' }),
    );
  });

  it('logs hibp_unexpected_status with the exact response.status on non-2xx', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve(''),
    } as Response);

    await checkPasswordBreach('whatever');

    expect(logger.warn).toHaveBeenCalledWith('hibp_unexpected_status', { status: 503 });
  });

  it('Sentry error message on non-2xx response is "HIBP returned status <code>"', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve(''),
    } as Response);

    await checkPasswordBreach('whatever');

    const [errorArg] = mockCaptureException.mock.calls[0] as [Error, unknown];
    expect(errorArg).toBeInstanceOf(Error);
    expect(errorArg.message).toBe('HIBP returned status 502');
  });

  it('Sentry context on non-2xx response carries component + mode=fail-open exactly', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(''),
    } as Response);

    await checkPasswordBreach('whatever');

    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      component: 'password-breach-check',
      mode: 'fail-open',
    });
  });

  it('fail-open with Sentry alert on network error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('ECONNREFUSED api.pwnedpasswords.com'));

    const result = await checkPasswordBreach('whatever');

    expect(result).toEqual({ breached: false, count: 0, failOpen: true });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('logs hibp_unavailable_failopen with the error message on network error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('ECONNREFUSED api.pwnedpasswords.com'));

    await checkPasswordBreach('whatever');

    expect(logger.warn).toHaveBeenCalledWith('hibp_unavailable_failopen', {
      error: 'ECONNREFUSED api.pwnedpasswords.com',
    });
  });

  it('Sentry context on network error carries component + mode=fail-open exactly', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));

    await checkPasswordBreach('whatever');

    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      component: 'password-breach-check',
      mode: 'fail-open',
    });
  });

  it('uses the SHA-1 first-5 prefix in the URL (k-anonymity contract)', async () => {
    const password = 'sha-prefix-check';
    const fullHash = sha1Upper(password);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(''));

    await checkPasswordBreach(password);

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain(`/range/${fullHash.slice(0, 5)}`);
    expect(calledUrl).toBe(`https://api.pwnedpasswords.com/range/${fullHash.slice(0, 5)}`);
  });

  it('matches the 35-char suffix (slice(5)) not the full hash — k-anonymity contract', async () => {
    // A password whose SHA-1 starts with the same 5-char prefix as another
    // breached suffix entry must NOT match — only the 35-char suffix matters.
    const password = 'suffix-distinguishes';
    const fullHash = sha1Upper(password);
    const ourSuffix = fullHash.slice(5);
    // Craft a fake "noise" line whose suffix differs from ours in the LAST char
    // so any mutation collapsing the slice(5) (e.g. slice(0)) would mis-match.
    const noiseSuffix = ourSuffix.slice(0, -1) + (ourSuffix.endsWith('0') ? '1' : '0');
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(`${noiseSuffix}:9\n${ourSuffix}:7\n`));

    const result = await checkPasswordBreach(password);

    expect(result).toEqual({ breached: true, count: 7, failOpen: false });
  });

  it('requires the colon delimiter — a suffix substring without ":" must not match', async () => {
    // The match uses `startsWith(suffix + ':')`. If the colon is stripped
    // (Stryker mutation 100:48 → empty string), then a line that merely
    // STARTS with our suffix-as-substring would falsely match. Body crafted
    // so that our suffix only appears followed by an alphanumeric, never ":".
    const password = 'colon-required-' + String(Date.now());
    const fullHash = sha1Upper(password);
    const suffix = fullHash.slice(5);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(`${suffix}X:99\n`));

    const result = await checkPasswordBreach(password);

    expect(result).toEqual({ breached: false, count: 0, failOpen: false });
  });

  it('sends the Add-Padding header so observers cannot infer the prefix from response size', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(''));

    await checkPasswordBreach('any');

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Add-Padding']).toBe('true');
  });

  it('sends the Musaium User-Agent header (HIBP API etiquette)', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(''));

    await checkPasswordBreach('any');

    const init = fetchSpy.mock.calls[0][1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('Musaium/1.0 (+security@musaium.app)');
  });

  it('uses HTTP GET on the HIBP range endpoint', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(''));

    await checkPasswordBreach('any');

    const init = fetchSpy.mock.calls[0][1]!;
    expect(init.method).toBe('GET');
  });

  it('passes an AbortSignal so the request can be cancelled on timeout', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(''));

    await checkPasswordBreach('any');

    const init = fetchSpy.mock.calls[0][1]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it('defaults timeoutMs to 2000ms when options.timeoutMs is undefined (timer fires after default delay)', async () => {
    jest.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        capturedSignal = init!.signal!;
        // Resolve only after the timer would have fired so we can observe abort state.
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(okResponse(''));
          }, 5000);
        });
      });

      const pending = checkPasswordBreach('any');
      // Advance just BEFORE the default 2000ms — must NOT yet be aborted.
      jest.advanceTimersByTime(1999);
      expect(capturedSignal?.aborted).toBe(false);
      // Crossing the default 2000ms threshold MUST abort (kills LogicalOperator
      // survivor 69:21 and the BlockStatement 75:34 inside setTimeout).
      jest.advanceTimersByTime(1);
      expect(capturedSignal?.aborted).toBe(true);

      jest.advanceTimersByTime(5000);
      const result = await pending;
      expect(result).toEqual({ breached: false, count: 0, failOpen: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it('honours an explicit options.timeoutMs override (timer fires earlier than default)', async () => {
    jest.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        capturedSignal = init!.signal!;
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(okResponse(''));
          }, 5000);
        });
      });

      const pending = checkPasswordBreach('any', { timeoutMs: 50 });
      jest.advanceTimersByTime(49);
      expect(capturedSignal?.aborted).toBe(false);
      jest.advanceTimersByTime(1);
      expect(capturedSignal?.aborted).toBe(true);

      jest.advanceTimersByTime(5000);
      await pending;
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the timer on the success path so it does not fire after fetch resolves', async () => {
    jest.useFakeTimers();
    const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
    try {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(''));

      await checkPasswordBreach('any', { timeoutMs: 10000 });

      expect(clearSpy).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('F10 — assertPasswordNotBreached', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    (logger.warn as jest.Mock).mockClear();
    (logger.info as jest.Mock).mockClear();
    (logger.error as jest.Mock).mockClear();
    mockPasswordBreachCheckEnabled.value = true;
    jest.restoreAllMocks();
  });

  it('throws AppError(PASSWORD_BREACHED, 400) when HIBP reports breached', async () => {
    const password = 'breached';
    const fullHash = sha1Upper(password);
    const suffix = fullHash.slice(5);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(`${suffix}:99\n`));

    await expect(assertPasswordNotBreached(password)).rejects.toMatchObject({
      statusCode: 400,
      code: 'PASSWORD_BREACHED',
    });
  });

  it('AppError carries the verbatim user-facing message (kills StringLiteral 145:9)', async () => {
    const password = 'breached-msg';
    const fullHash = sha1Upper(password);
    const suffix = fullHash.slice(5);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(`${suffix}:1\n`));

    await expect(assertPasswordNotBreached(password)).rejects.toMatchObject({
      message:
        'This password has appeared in known data breaches. Please choose a different password.',
    });
  });

  it('does not throw when HIBP reports the password is clean', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(''));

    await expect(assertPasswordNotBreached('whatever')).resolves.toBeUndefined();
  });

  it('does not throw when HIBP is unreachable (fail-open semantics)', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));

    await expect(assertPasswordNotBreached('whatever')).resolves.toBeUndefined();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('short-circuits and does NOT call fetch when env.auth.passwordBreachCheckEnabled is false', async () => {
    mockPasswordBreachCheckEnabled.value = false;
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    await expect(assertPasswordNotBreached('would-be-breached')).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('still calls fetch when env.auth.passwordBreachCheckEnabled is true (positive guard)', async () => {
    mockPasswordBreachCheckEnabled.value = true;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(''));

    await assertPasswordNotBreached('clean');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
