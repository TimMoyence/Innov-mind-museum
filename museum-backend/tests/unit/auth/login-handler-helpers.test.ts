/**
 * Tests for src/modules/auth/adapters/primary/http/helpers/login-handler.helpers.ts.
 *
 * Targets the 33 Stryker NoCoverage mutants on this file by exercising:
 *   - finalizeLoginSuccess
 *       - String literal payload keys: action ('AUTH_LOGIN_SUCCESS'),
 *         actorType ('user'), targetType ('user').
 *       - Object-literal payload metadata + the body of the if-block at L34.
 *       - The unconditional call to setAuthCookies(res, session) at L57.
 *   - auditLoginError
 *       - Early-return when error is not an AppError (L65 BlockStatement, L66 boolean
 *         + conditional flips).
 *       - Optional-chaining on req.body?.email (L67) — undefined body must not throw.
 *       - typeof email === 'string' branch at L68 (typeof flip + string literal).
 *       - error.code === 'INVALID_CREDENTIALS' branch at L69 (action 'AUTH_LOGIN_FAILED',
 *         actorType 'anonymous', metadata.email present/absent).
 *       - error.code === 'TOO_MANY_REQUESTS' branch at L79 (action 'SECURITY_RATE_LIMIT',
 *         metadata.endpoint '/login').
 *
 * No production code is modified.
 */

import {
  auditLoginError,
  finalizeLoginSuccess,
} from '@modules/auth/adapters/primary/http/helpers/login-handler.helpers';
import { setAuthCookies } from '@modules/auth/adapters/primary/http/helpers/auth-cookies';
import { auditService } from '@shared/audit';
import {
  AUDIT_AUTH_LOGIN_FAILED,
  AUDIT_AUTH_LOGIN_SUCCESS,
  AUDIT_SECURITY_RATE_LIMIT,
} from '@shared/audit/audit.types';
import { AppError } from '@shared/errors/app.error';

import type { Request, Response } from 'express';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

jest.mock('@modules/auth/adapters/primary/http/helpers/auth-cookies', () => ({
  setAuthCookies: jest.fn(),
}));

// ─── Shared fixtures ─────────────────────────────────────────────────────────

interface LoginSession {
  user: { id: number };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

const makeReq = (overrides: Partial<Request> = {}): Request => {
  const base: Partial<Request> = {
    ip: '203.0.113.7',
    requestId: 'req-abc-123',
    body: {},
  };
  return { ...base, ...overrides } as unknown as Request;
};

const makeRes = (): Response =>
  ({
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    setHeader: jest.fn(),
  }) as unknown as Response;

const makeSession = (overrides: Partial<LoginSession> = {}): LoginSession => ({
  user: { id: 42 },
  accessToken: 'acc-token',
  refreshToken: 'ref-token',
  expiresIn: 900,
  refreshExpiresIn: 2_592_000,
  ...overrides,
});

// Strongly-typed mock handle obtained via the `unknown` two-step cast.
const auditLogMock = auditService.log as unknown as jest.Mock;
const setAuthCookiesMock = setAuthCookies as unknown as jest.Mock;

beforeEach(() => {
  auditLogMock.mockReset();
  auditLogMock.mockResolvedValue(undefined);
  setAuthCookiesMock.mockReset();
});

// ─── finalizeLoginSuccess ────────────────────────────────────────────────────

describe('finalizeLoginSuccess', () => {
  it('always invokes setAuthCookies with the response + session (kills L57 BlockStatement / dual-mode contract)', async () => {
    const req = makeReq();
    const res = makeRes();
    const session = makeSession({ user: { id: 5 } });

    await finalizeLoginSuccess(req, res, session);

    expect(setAuthCookiesMock).toHaveBeenCalledTimes(1);
    expect(setAuthCookiesMock).toHaveBeenCalledWith(res, session);
  });

  it('emits AUTH_LOGIN_SUCCESS with the exact "AUTH_LOGIN_SUCCESS" string (kills string-literal-empty mutants)', async () => {
    expect(AUDIT_AUTH_LOGIN_SUCCESS).toBe('AUTH_LOGIN_SUCCESS');

    const req = makeReq();
    const res = makeRes();
    const session = makeSession({ user: { id: 21 } });

    await finalizeLoginSuccess(req, res, session);

    const lastCallArg = auditLogMock.mock.calls[auditLogMock.mock.calls.length - 1]?.[0] as {
      action: string;
      actorType: string;
      targetType: string;
    };
    expect(lastCallArg.action).toBe('AUTH_LOGIN_SUCCESS');
    expect(lastCallArg.actorType).toBe('user');
    expect(lastCallArg.targetType).toBe('user');
  });
});

// ─── auditLoginError ──────────────────────────────────────────────────────────

describe('auditLoginError — non-AppError early-return', () => {
  it('does not call auditService.log when error is a plain Error (kills L66 ConditionalExpression flip)', async () => {
    const req = makeReq({ body: { email: 'plain@example.com' } });

    await auditLoginError(req, new Error('boom'));

    expect(auditLogMock).not.toHaveBeenCalled();
  });

  it('does not call auditService.log when error is null/undefined/string (kills L66 boolean / instanceof flip)', async () => {
    const req = makeReq();

    await auditLoginError(req, null);
    await auditLoginError(req, undefined);
    await auditLoginError(req, 'not an error');
    await auditLoginError(req, { code: 'INVALID_CREDENTIALS' }); // duck-type, NOT instanceof

    expect(auditLogMock).not.toHaveBeenCalled();
  });

  it('does not call auditService.log when AppError has an unrecognised code (kills L69 + L79 conditional → true)', async () => {
    // Both L69 (=== 'INVALID_CREDENTIALS') and L79 (=== 'TOO_MANY_REQUESTS') are
    // false → no audit emitted. If either ConditionalExpression mutant flips to
    // `true`, the corresponding `auditService.log` would still fire and this
    // assertion would fail.
    const req = makeReq({ body: { email: 'x@y.z' } });
    const err = new AppError({
      message: 'forbidden',
      statusCode: 403,
      code: 'FORBIDDEN',
    });

    await auditLoginError(req, err);

    expect(auditLogMock).not.toHaveBeenCalled();
  });
});

describe('auditLoginError — INVALID_CREDENTIALS', () => {
  it('emits AUDIT_AUTH_LOGIN_FAILED with the email string when req.body.email is a string', async () => {
    const req = makeReq({
      ip: '192.0.2.1',
      requestId: 'req-fail-1',
      body: { email: 'alice@example.com' },
    });
    const err = new AppError({
      message: 'bad creds',
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });

    await auditLoginError(req, err);

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    // Strict shape — kills L70 ObjectLiteral, L72 'AUTH_LOGIN_FAILED', L73 metadata.
    // A1 / GDPR Art. 5(1)(c): only the email DOMAIN is retained, never the raw address.
    expect(auditLogMock).toHaveBeenCalledWith({
      action: AUDIT_AUTH_LOGIN_FAILED,
      actorType: 'anonymous',
      metadata: { emailDomain: 'example.com' },
      ip: '192.0.2.1',
      requestId: 'req-fail-1',
    });
    expect(AUDIT_AUTH_LOGIN_FAILED).toBe('AUTH_LOGIN_FAILED');
  });

  it('emits AUDIT_AUTH_LOGIN_FAILED with metadata.emailDomain === undefined when req.body.email is a number (kills L68 typeof + L68 string literal flip)', async () => {
    // If L68 EqualityOperator `===` flips to `!==`, a non-string would be kept
    // and we'd see `email: 12345` in metadata. If L68 StringLiteral '' replaces
    // 'string', the check becomes `typeof email === ''` which is never true → all
    // non-undefined emails become undefined → contradicts the alice case above.
    const req = makeReq({ body: { email: 12345 } });
    const err = new AppError({
      message: 'bad creds',
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });

    await auditLoginError(req, err);

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_AUTH_LOGIN_FAILED,
        metadata: { emailDomain: undefined },
      }),
    );
  });

  it('tolerates an undefined req.body (kills L67 OptionalChaining → non-optional flip)', async () => {
    // If the OptionalChaining mutant strips `?.` the cast `(req.body as ...)`
    // becomes a property access on `undefined` → throws TypeError. We assert
    // the helper resolves and emits with `metadata.email: undefined`.
    const req = makeReq({ body: undefined });
    const err = new AppError({
      message: 'bad creds',
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });

    await expect(auditLoginError(req, err)).resolves.toBeUndefined();
    expect(auditLogMock).toHaveBeenCalledTimes(1);
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_AUTH_LOGIN_FAILED,
        metadata: { emailDomain: undefined },
      }),
    );
  });

  it('returns immediately after the INVALID_CREDENTIALS branch (does not also fire TOO_MANY_REQUESTS audit)', async () => {
    const req = makeReq({ body: { email: 'a@b.c' } });
    const err = new AppError({
      message: 'bad creds',
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });

    await auditLoginError(req, err);

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    const firstCall = auditLogMock.mock.calls[0]?.[0] as { action: string };
    expect(firstCall.action).toBe('AUTH_LOGIN_FAILED');
  });
});

describe('auditLoginError — TOO_MANY_REQUESTS', () => {
  it('emits AUDIT_SECURITY_RATE_LIMIT with endpoint "/login" and the email domain (kills L80/L82/L83 + L83:47 "/login" literal)', async () => {
    const req = makeReq({
      ip: '198.51.100.42',
      requestId: 'req-rate-1',
      body: { email: 'bob@example.com' },
    });
    const err = new AppError({
      message: 'rate limited',
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });

    await auditLoginError(req, err);

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    // A1 / GDPR Art. 5(1)(c): only the email DOMAIN is retained, never the raw address.
    expect(auditLogMock).toHaveBeenCalledWith({
      action: AUDIT_SECURITY_RATE_LIMIT,
      actorType: 'anonymous',
      metadata: { emailDomain: 'example.com', endpoint: '/login' },
      ip: '198.51.100.42',
      requestId: 'req-rate-1',
    });
    expect(AUDIT_SECURITY_RATE_LIMIT).toBe('SECURITY_RATE_LIMIT');
  });

  it('emits AUDIT_SECURITY_RATE_LIMIT with undefined emailDomain when req.body has no email field', async () => {
    const req = makeReq({ body: {} });
    const err = new AppError({
      message: 'rate limited',
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });

    await auditLoginError(req, err);

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_SECURITY_RATE_LIMIT,
        metadata: { emailDomain: undefined, endpoint: '/login' },
      }),
    );
  });

  it('uses exact "/login" endpoint literal (kills L83:47 StringLiteral → "")', async () => {
    const req = makeReq({ body: { email: 'c@d.e' } });
    const err = new AppError({
      message: 'rate limited',
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });

    await auditLoginError(req, err);

    const call = auditLogMock.mock.calls[0]?.[0] as {
      metadata: { endpoint: string };
    };
    expect(call.metadata.endpoint).toBe('/login');
    expect(call.metadata.endpoint).not.toBe('');
  });
});
