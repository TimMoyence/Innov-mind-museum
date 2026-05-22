import { AppError } from '@shared/errors/app.error';
import {
  makePartialRequest,
  makePartialResponse,
  makeNext,
} from '../../helpers/http/express-mock.helpers';

// Mock the auth session service BEFORE importing the middleware
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

jest.mock(
  './apiKey.middleware',
  () => ({
    validateApiKey: jest.fn(),
  }),
  { virtual: true },
);

// Mock the apiKey.middleware relative import used inside authenticated.middleware
jest.mock('@shared/middleware/apiKey.middleware', () => ({
  validateApiKey: jest.fn(),
}));

import {
  isAuthenticated,
  isAuthenticatedJwtOnly,
} from '@shared/middleware/authenticated.middleware';
import { authSessionService } from '@modules/auth/useCase';
import { validateApiKey } from '@shared/middleware/apiKey.middleware';

// Post C3: middlewares are async (await denylist.has). Helper accepts both
// sync-throw and async-rejection patterns via Promise.resolve(fn()).
const expectUnauthorized = async (
  fn: () => void | Promise<void>,
  message: string,
): Promise<void> => {
  try {
    await Promise.resolve(fn());
    fail('Expected AppError to be thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
    expect((error as AppError).code).toBe('UNAUTHORIZED');
    expect((error as AppError).message).toBe(message);
  }
};

describe('isAuthenticated middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws 401 AppError when no Authorization header is present', async () => {
    const req = makePartialRequest();
    const res = makePartialResponse();
    const next = makeNext();

    await expectUnauthorized(() => isAuthenticated(req, res, next), 'Token required');
    expect(next).not.toHaveBeenCalled();
  });

  it('throws 401 AppError when Authorization header has no Bearer token', async () => {
    const req = makePartialRequest({ headers: { authorization: 'Bearer' } });
    const res = makePartialResponse();
    const next = makeNext();

    await expectUnauthorized(() => isAuthenticated(req, res, next), 'Token required');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.user on valid JWT token', async () => {
    (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockReturnValue({
      id: 1,
      role: 'visitor',
      museumId: null,
      jti: 'jti-test',
      expSec: 9999999999,
    });

    const req = makePartialRequest({ headers: { authorization: 'Bearer valid-jwt' } });
    const res = makePartialResponse();
    const next = makeNext();

    await isAuthenticated(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 1, role: 'visitor', museumId: null });
  });

  it('sets req.museumId from token when present', async () => {
    (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockReturnValue({
      id: 2,
      role: 'museum_manager',
      museumId: 42,
      jti: 'jti-test',
      expSec: 9999999999,
    });

    const req = makePartialRequest({ headers: { authorization: 'Bearer valid-jwt' } });
    const res = makePartialResponse();
    const next = makeNext();

    await isAuthenticated(req, res, next);

    expect(req.museumId).toBe(42);
  });

  it('throws 401 AppError when JWT verification throws', async () => {
    (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockImplementation(() => {
      throw new Error('invalid token');
    });

    const req = makePartialRequest({ headers: { authorization: 'Bearer bad-jwt' } });
    const res = makePartialResponse();
    const next = makeNext();

    await expectUnauthorized(() => isAuthenticated(req, res, next), 'Invalid token');
    expect(next).not.toHaveBeenCalled();
  });

  it('routes msk_ tokens to validateApiKey (API keys always enabled after flag retirement)', async () => {
    // After the `apiKeys` feature-flag retirement (commits 22d6e3f2 + 9d8952e3),
    // API-key auth is always-on. Any Bearer token starting with `msk_` is
    // delegated to validateApiKey instead of JWT verification.
    (validateApiKey as jest.Mock).mockResolvedValue(undefined);

    const req = makePartialRequest({ headers: { authorization: 'Bearer msk_testkey123' } });
    const res = makePartialResponse();
    const next = makeNext();

    await isAuthenticated(req, res, next);

    expect(validateApiKey).toHaveBeenCalledWith('msk_testkey123', req, res, next);
    expect(authSessionService.verifyAccessTokenWithClaims).not.toHaveBeenCalled();
  });

  it('sets req.museumId to undefined when token museumId is null', async () => {
    (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockReturnValue({
      id: 3,
      role: 'visitor',
      museumId: null,
      jti: 'jti-test',
      expSec: 9999999999,
    });

    const req = makePartialRequest({ headers: { authorization: 'Bearer valid-jwt' } });
    const res = makePartialResponse();
    const next = makeNext();

    await isAuthenticated(req, res, next);

    expect(req.museumId).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('isAuthenticatedJwtOnly middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws 401 AppError when no token is present', async () => {
    const req = makePartialRequest();
    const res = makePartialResponse();
    const next = makeNext();

    await expectUnauthorized(() => isAuthenticatedJwtOnly(req, res, next), 'Token required');
  });

  it('rejects msk_ tokens with specific error message', async () => {
    const req = makePartialRequest({ headers: { authorization: 'Bearer msk_someapikey' } });
    const res = makePartialResponse();
    const next = makeNext();

    await expectUnauthorized(
      () => isAuthenticatedJwtOnly(req, res, next),
      'JWT authentication required for this endpoint',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.user on valid JWT token', async () => {
    (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockReturnValue({
      id: 5,
      role: 'admin',
      museumId: null,
      jti: 'jti-test',
      expSec: 9999999999,
    });

    const req = makePartialRequest({ headers: { authorization: 'Bearer valid-jwt' } });
    const res = makePartialResponse();
    const next = makeNext();

    await isAuthenticatedJwtOnly(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 5, role: 'admin', museumId: null });
  });

  it('throws 401 AppError when JWT verification throws', async () => {
    (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockImplementation(() => {
      throw new Error('expired');
    });

    const req = makePartialRequest({ headers: { authorization: 'Bearer expired-jwt' } });
    const res = makePartialResponse();
    const next = makeNext();

    await expectUnauthorized(() => isAuthenticatedJwtOnly(req, res, next), 'Invalid token');
  });
});
