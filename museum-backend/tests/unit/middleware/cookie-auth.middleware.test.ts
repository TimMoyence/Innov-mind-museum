/**
 * F7 (HIGH) — Cookie auth fallback unit tests.
 *
 * `isAuthenticated` is updated to support a dual auth path:
 *   - Authorization: Bearer <jwt>  → existing path (mobile, takes precedence)
 *   - Cookie:        access_token=<jwt>  → web admin path
 *
 * If both are present, Bearer wins (so mobile cannot be confused by cookies
 * propagated from a webview).
 */

import { AppError } from '@shared/errors/app.error';

import {
  makePartialRequest,
  makePartialResponse,
  makeNext,
} from '../../helpers/http/express-mock.helpers';

// Post C3 (run 2026-05-21-p0-c3-auth-crypto): middleware async + uses
// verifyAccessTokenWithClaims (returns {id, role, museumId, jti, expSec})
// for denylist consultation per R8.
jest.mock('@modules/auth/useCase', () => ({
  authSessionService: {
    verifyAccessToken: jest.fn(),
    verifyAccessTokenWithClaims: jest.fn(),
  },
}));

jest.mock('@shared/observability/sentry', () => ({
  setUser: jest.fn(),
}));

jest.mock('@shared/middleware/apiKey.middleware', () => ({
  validateApiKey: jest.fn(),
}));

import { authSessionService } from '@modules/auth/useCase';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';

// Post C3: middlewares are async (await denylist.has). Helper accepts both
// sync-throw and async-rejection patterns via Promise.resolve(fn()).
const expectUnauthorized = async (fn: () => void | Promise<void>): Promise<AppError> => {
  try {
    await Promise.resolve(fn());
    fail('Expected AppError to be thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  // Unreachable — fail() throws.
  throw new Error('unreachable');
};

describe('isAuthenticated — cookie fallback (F7)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads access_token cookie when no Authorization header is present', async () => {
    (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockReturnValue({
      id: 7,
      role: 'admin',
      museumId: null,
      jti: 'jti-test',
      expSec: 9999999999,
    });

    const req = makePartialRequest({
      cookies: { access_token: 'cookie-jwt' },
    });
    const res = makePartialResponse();
    const next = makeNext();

    await isAuthenticated(req, res, next);

    expect(authSessionService.verifyAccessTokenWithClaims).toHaveBeenCalledWith('cookie-jwt');
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 7, role: 'admin', museumId: null });
  });

  it('throws 401 when cookie JWT is invalid / expired', async () => {
    (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockImplementation(() => {
      throw new Error('expired');
    });

    const req = makePartialRequest({
      cookies: { access_token: 'expired-cookie-jwt' },
    });
    const res = makePartialResponse();
    const next = makeNext();

    const err = await expectUnauthorized(async () => {
      await isAuthenticated(req, res, next);
    });
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('prefers Authorization: Bearer when both Bearer header and access_token cookie are present', async () => {
    (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockReturnValue({
      id: 1,
      role: 'visitor',
      museumId: null,
      jti: 'jti-test',
      expSec: 9999999999,
    });

    const req = makePartialRequest({
      headers: { authorization: 'Bearer header-jwt' },
      cookies: { access_token: 'cookie-jwt' },
    });
    const res = makePartialResponse();
    const next = makeNext();

    await isAuthenticated(req, res, next);

    // Bearer wins — verifyAccessToken called with the header value, not the cookie.
    expect(authSessionService.verifyAccessTokenWithClaims).toHaveBeenCalledWith('header-jwt');
    expect(authSessionService.verifyAccessTokenWithClaims).not.toHaveBeenCalledWith('cookie-jwt');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 401 "Token required" when neither Bearer header nor cookie are present', async () => {
    const req = makePartialRequest({});
    const res = makePartialResponse();
    const next = makeNext();

    const err = await expectUnauthorized(async () => {
      await isAuthenticated(req, res, next);
    });
    expect(err.message).toBe('Token required');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not treat msk_-prefixed cookie as an API key (cookie path is JWT-only)', async () => {
    // Cookies are set by us and only ever carry user-session JWTs; if one
    // arrives with the API-key prefix it's almost certainly tampered. Try to
    // verify it as a JWT (which will fail) rather than route to the API-key
    // path that bypasses CSRF protections.
    (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockImplementation(() => {
      throw new Error('not a JWT');
    });

    const req = makePartialRequest({
      cookies: { access_token: 'msk_some_api_key' },
    });
    const res = makePartialResponse();
    const next = makeNext();

    const err = await expectUnauthorized(async () => {
      await isAuthenticated(req, res, next);
    });
    expect(err.statusCode).toBe(401);
  });
});
