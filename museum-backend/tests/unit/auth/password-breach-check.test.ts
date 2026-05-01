/**
 * F10 (2026-04-30) — HIBP Pwned Passwords k-anonymity client.
 *
 * Validates the SHA-1 prefix/suffix protocol, padded-entry filtering, fail-open
 * on transport errors, and the AppError thrown by `assertPasswordNotBreached`.
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

import {
  assertPasswordNotBreached,
  checkPasswordBreach,
} from '@shared/validation/password-breach-check';

const sha1Upper = (value: string): string =>
  crypto.createHash('sha1').update(value).digest('hex').toUpperCase();

describe('F10 — checkPasswordBreach (HIBP k-anonymity)', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    jest.restoreAllMocks();
  });

  it('returns breached:false when the suffix is not in the response body', async () => {
    const password = 'unique-passphrase-not-in-corpus-' + Date.now();
    const fullHash = sha1Upper(password);
    const otherSuffix = 'A'.repeat(35);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`${otherSuffix}:5\n`),
    } as Response);

    const result = await checkPasswordBreach(password);

    expect(result).toEqual({ breached: false, count: 0, failOpen: false });
    expect(fullHash).toBeTruthy(); // sanity — no test pollution
  });

  it('returns breached:true with the count when the suffix appears in the response', async () => {
    const password = 'pwn3d-test-' + Date.now();
    const fullHash = sha1Upper(password);
    const suffix = fullHash.slice(5);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\n${suffix}:42\n`),
    } as Response);

    const result = await checkPasswordBreach(password);

    expect(result).toEqual({ breached: true, count: 42, failOpen: false });
  });

  it('treats Add-Padding count=0 entries as not-breached', async () => {
    const password = 'padded-test';
    const fullHash = sha1Upper(password);
    const suffix = fullHash.slice(5);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`${suffix}:0\n`),
    } as Response);

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

  it('fail-open with Sentry alert on network error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('ECONNREFUSED api.pwnedpasswords.com'));

    const result = await checkPasswordBreach('whatever');

    expect(result).toEqual({ breached: false, count: 0, failOpen: true });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('uses the SHA-1 first-5 prefix in the URL (k-anonymity contract)', async () => {
    const password = 'sha-prefix-check';
    const fullHash = sha1Upper(password);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    } as Response);

    await checkPasswordBreach(password);

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain(`/range/${fullHash.slice(0, 5)}`);
  });

  it('sends the Add-Padding header so observers cannot infer the prefix from response size', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    } as Response);

    await checkPasswordBreach('any');

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Add-Padding']).toBe('true');
  });
});

describe('F10 — assertPasswordNotBreached', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    jest.restoreAllMocks();
  });

  it('throws AppError(PASSWORD_BREACHED, 400) when HIBP reports breached', async () => {
    const password = 'breached';
    const fullHash = sha1Upper(password);
    const suffix = fullHash.slice(5);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`${suffix}:99\n`),
    } as Response);

    await expect(assertPasswordNotBreached(password)).rejects.toMatchObject({
      statusCode: 400,
      code: 'PASSWORD_BREACHED',
    });
  });

  it('does not throw when HIBP reports the password is clean', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    } as Response);

    await expect(assertPasswordNotBreached('whatever')).resolves.toBeUndefined();
  });

  it('does not throw when HIBP is unreachable (fail-open semantics)', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));

    await expect(assertPasswordNotBreached('whatever')).resolves.toBeUndefined();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
