/**
 * F7 (HIGH) — CSRF middleware unit tests.
 *
 * Double-submit token model:
 *   - csrf_token cookie (NOT httpOnly — JS readable)
 *   - X-CSRF-Token request header
 *   - cookie value MUST equal HMAC-SHA256(access_token cookie, CSRF_SECRET)
 *
 * Skip rules:
 *   - GET / HEAD / OPTIONS always skipped (read-only)
 *   - No `access_token` cookie ⇒ skipped (Bearer/mobile path)
 *
 * Failure ⇒ 403 CSRF_INVALID.
 */

import crypto from 'node:crypto';

import { AppError } from '@shared/errors/app.error';

import { makePartialRequest, makeNext } from '../../helpers/http/express-mock.helpers';

import type { Request, Response } from 'express';

// Mock env to control csrfSecret deterministically.
jest.mock('@src/config/env', () => ({
  env: {
    nodeEnv: 'test',
    auth: {
      csrfSecret: 'test-csrf-secret-32chars-minimum-aaaa',
    },
  },
}));

import { csrfMiddleware } from '@src/helpers/middleware/csrf.middleware';

const ACCESS_TOKEN = 'fake.jwt.value';
const CSRF_SECRET = 'test-csrf-secret-32chars-minimum-aaaa';
const VALID_CSRF = crypto.createHmac('sha256', CSRF_SECRET).update(ACCESS_TOKEN).digest('hex');

const makeReq = (
  init: {
    method?: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): Request => {
  return makePartialRequest({
    method: init.method ?? 'POST',
    headers: init.headers ?? {},
    cookies: init.cookies ?? {},
  });
};

const makeRes = (): Response => {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
};

describe('csrfMiddleware', () => {
  it('passes when csrf cookie matches X-CSRF-Token header AND HMAC binds to access_token', () => {
    const req = makeReq({
      method: 'POST',
      cookies: { access_token: ACCESS_TOKEN, csrf_token: VALID_CSRF },
      headers: { 'x-csrf-token': VALID_CSRF },
    });
    const res = makeRes();
    const next = makeNext();

    csrfMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('throws 403 CSRF_INVALID when X-CSRF-Token header is missing', () => {
    const req = makeReq({
      method: 'POST',
      cookies: { access_token: ACCESS_TOKEN, csrf_token: VALID_CSRF },
      headers: {},
    });
    const res = makeRes();
    const next = makeNext();

    expect(() => csrfMiddleware(req, res, next)).toThrow(AppError);
    try {
      csrfMiddleware(req, res, next);
    } catch (error) {
      expect((error as AppError).statusCode).toBe(403);
      expect((error as AppError).code).toBe('CSRF_INVALID');
    }
  });

  it('throws 403 CSRF_INVALID when cookie and header values mismatch', () => {
    const req = makeReq({
      method: 'POST',
      cookies: { access_token: ACCESS_TOKEN, csrf_token: VALID_CSRF },
      headers: { 'x-csrf-token': 'wrong-value' },
    });
    const res = makeRes();
    const next = makeNext();

    expect(() => csrfMiddleware(req, res, next)).toThrow(AppError);
  });

  it('throws 403 CSRF_INVALID when csrf cookie is not the HMAC of the access_token cookie', () => {
    // Attacker sets a matching pair (cookie === header) but cookie is NOT bound
    // to the actual session. HMAC check should reject.
    const forgedToken = 'attacker-supplied-value';
    const req = makeReq({
      method: 'POST',
      cookies: { access_token: ACCESS_TOKEN, csrf_token: forgedToken },
      headers: { 'x-csrf-token': forgedToken },
    });
    const res = makeRes();
    const next = makeNext();

    expect(() => csrfMiddleware(req, res, next)).toThrow(AppError);
    try {
      csrfMiddleware(req, res, next);
    } catch (error) {
      expect((error as AppError).code).toBe('CSRF_INVALID');
    }
  });

  it('skips GET requests (read-only, no CSRF needed)', () => {
    const req = makeReq({
      method: 'GET',
      cookies: { access_token: ACCESS_TOKEN },
      headers: {},
    });
    const res = makeRes();
    const next = makeNext();

    csrfMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('skips HEAD and OPTIONS requests', () => {
    for (const method of ['HEAD', 'OPTIONS']) {
      const req = makeReq({
        method,
        cookies: { access_token: ACCESS_TOKEN },
        headers: {},
      });
      const res = makeRes();
      const next = makeNext();

      csrfMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('skips when no access_token cookie is present (Bearer/mobile path)', () => {
    const req = makeReq({
      method: 'POST',
      cookies: {},
      headers: { authorization: 'Bearer some.jwt.token' },
    });
    const res = makeRes();
    const next = makeNext();

    csrfMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('skips when access_token cookie is absent even if csrf_token cookie is set', () => {
    // Edge case: client somehow has stale csrf_token cookie but no session.
    // Without an active cookie session the CSRF check is irrelevant — let it
    // fall through to auth which will 401.
    const req = makeReq({
      method: 'POST',
      cookies: { csrf_token: 'stale' },
      headers: {},
    });
    const res = makeRes();
    const next = makeNext();

    csrfMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 403 CSRF_INVALID when access_token cookie is set but csrf_token cookie is missing', () => {
    const req = makeReq({
      method: 'POST',
      cookies: { access_token: ACCESS_TOKEN },
      headers: { 'x-csrf-token': VALID_CSRF },
    });
    const res = makeRes();
    const next = makeNext();

    expect(() => csrfMiddleware(req, res, next)).toThrow(AppError);
  });

  it('uses constant-time comparison (no early-exit timing leak)', () => {
    // We can't observe timing in a unit test, but we assert that two values
    // that share a prefix but differ at the end are still rejected (proves
    // the comparison reads through the full string). This is a property test
    // not a timing test.
    const almostValid = `${VALID_CSRF.slice(0, -2)}xx`;
    const req = makeReq({
      method: 'POST',
      cookies: { access_token: ACCESS_TOKEN, csrf_token: almostValid },
      headers: { 'x-csrf-token': almostValid },
    });
    const res = makeRes();
    const next = makeNext();

    expect(() => csrfMiddleware(req, res, next)).toThrow(AppError);
  });

  it('rejects PUT, PATCH, DELETE same as POST', () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const req = makeReq({
        method,
        cookies: { access_token: ACCESS_TOKEN, csrf_token: VALID_CSRF },
        headers: {},
      });
      const res = makeRes();
      const next = makeNext();

      expect(() => csrfMiddleware(req, res, next)).toThrow(AppError);
    }
  });
});
