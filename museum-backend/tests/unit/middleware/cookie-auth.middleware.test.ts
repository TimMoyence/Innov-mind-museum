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

jest.mock('@modules/auth/useCase', () => ({
  authSessionService: {
    verifyAccessToken: jest.fn(),
  },
}));

jest.mock('@shared/observability/sentry', () => ({
  setUser: jest.fn(),
}));

jest.mock('@src/helpers/middleware/apiKey.middleware', () => ({
  validateApiKey: jest.fn(),
}));

import { authSessionService } from '@modules/auth/useCase';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';

const expectUnauthorized = (fn: () => void): AppError => {
  try {
    fn();
    fail('Expected AppError to be thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
};

describe('isAuthenticated — cookie fallback (F7)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads access_token cookie when no Authorization header is present', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockReturnValue({
      id: 7,
      role: 'admin',
      museumId: null,
    });

    const req = makePartialRequest({
      cookies: { access_token: 'cookie-jwt' },
    });
    const res = makePartialResponse();
    const next = makeNext();

    isAuthenticated(req, res, next);

    expect(authSessionService.verifyAccessToken).toHaveBeenCalledWith('cookie-jwt');
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 7, role: 'admin', museumId: null });
  });

  it('throws 401 when cookie JWT is invalid / expired', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockImplementation(() => {
      throw new Error('expired');
    });

    const req = makePartialRequest({
      cookies: { access_token: 'expired-cookie-jwt' },
    });
    const res = makePartialResponse();
    const next = makeNext();

    const err = expectUnauthorized(() => {
      isAuthenticated(req, res, next);
    });
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('prefers Authorization: Bearer when both Bearer header and access_token cookie are present', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockReturnValue({
      id: 1,
      role: 'visitor',
      museumId: null,
    });

    const req = makePartialRequest({
      headers: { authorization: 'Bearer header-jwt' },
      cookies: { access_token: 'cookie-jwt' },
    });
    const res = makePartialResponse();
    const next = makeNext();

    isAuthenticated(req, res, next);

    // Bearer wins — verifyAccessToken called with the header value, not the cookie.
    expect(authSessionService.verifyAccessToken).toHaveBeenCalledWith('header-jwt');
    expect(authSessionService.verifyAccessToken).not.toHaveBeenCalledWith('cookie-jwt');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 401 "Token required" when neither Bearer header nor cookie are present', () => {
    const req = makePartialRequest({});
    const res = makePartialResponse();
    const next = makeNext();

    const err = expectUnauthorized(() => {
      isAuthenticated(req, res, next);
    });
    expect(err.message).toBe('Token required');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not treat msk_-prefixed cookie as an API key (cookie path is JWT-only)', () => {
    // Cookies are set by us and only ever carry user-session JWTs; if one
    // arrives with the API-key prefix it's almost certainly tampered. Try to
    // verify it as a JWT (which will fail) rather than route to the API-key
    // path that bypasses CSRF protections.
    (authSessionService.verifyAccessToken as jest.Mock).mockImplementation(() => {
      throw new Error('not a JWT');
    });

    const req = makePartialRequest({
      cookies: { access_token: 'msk_some_api_key' },
    });
    const res = makePartialResponse();
    const next = makeNext();

    const err = expectUnauthorized(() => {
      isAuthenticated(req, res, next);
    });
    expect(err.statusCode).toBe(401);
  });
});
