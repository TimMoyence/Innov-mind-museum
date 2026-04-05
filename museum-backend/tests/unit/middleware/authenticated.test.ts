import type { Request, Response, NextFunction } from 'express';

import { AppError } from '@shared/errors/app.error';

// Mock the auth session service BEFORE importing the middleware
jest.mock('@modules/auth/useCase', () => ({
  authSessionService: {
    verifyAccessToken: jest.fn(),
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
jest.mock('@src/helpers/middleware/apiKey.middleware', () => ({
  validateApiKey: jest.fn(),
}));

import {
  isAuthenticated,
  isAuthenticatedJwtOnly,
} from '@src/helpers/middleware/authenticated.middleware';
import { authSessionService } from '@modules/auth/useCase';

const mockRes = (): Response => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

const expectUnauthorized = (fn: () => void, message: string): void => {
  try {
    fn();
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

  it('throws 401 AppError when no Authorization header is present', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    expectUnauthorized(() => isAuthenticated(req, res, next), 'Token required');
    expect(next).not.toHaveBeenCalled();
  });

  it('throws 401 AppError when Authorization header has no Bearer token', () => {
    const req = { headers: { authorization: 'Bearer' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    expectUnauthorized(() => isAuthenticated(req, res, next), 'Token required');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.user on valid JWT token', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockReturnValue({
      id: 1,
      role: 'visitor',
      museumId: null,
    });

    const req = { headers: { authorization: 'Bearer valid-jwt' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticated(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 1, role: 'visitor', museumId: null });
  });

  it('sets req.museumId from token when present', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockReturnValue({
      id: 2,
      role: 'museum_manager',
      museumId: 42,
    });

    const req = { headers: { authorization: 'Bearer valid-jwt' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticated(req, res, next);

    expect(req.museumId).toBe(42);
  });

  it('throws 401 AppError when JWT verification throws', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockImplementation(() => {
      throw new Error('invalid token');
    });

    const req = { headers: { authorization: 'Bearer bad-jwt' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    expectUnauthorized(() => isAuthenticated(req, res, next), 'Invalid token');
    expect(next).not.toHaveBeenCalled();
  });

  it('throws 401 AppError when msk_ token and apiKeys flag is false', () => {
    // In test env, apiKeys flag is false, so msk_ tokens should fall to JWT
    (authSessionService.verifyAccessToken as jest.Mock).mockImplementation(() => {
      throw new Error('not a JWT');
    });

    const req = { headers: { authorization: 'Bearer msk_testkey123' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    // Should fail as JWT since apiKeys is not enabled
    expectUnauthorized(() => isAuthenticated(req, res, next), 'Invalid token');
  });

  // Note: The msk_ + apiKeys=true branch (lines 26-27) cannot be unit-tested here
  // because the env flag is read at module scope. It would require isolateModules
  // but the relative import of apiKey.middleware causes resolution issues.

  it('sets req.museumId to undefined when token museumId is null', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockReturnValue({
      id: 3,
      role: 'visitor',
      museumId: null,
    });

    const req = { headers: { authorization: 'Bearer valid-jwt' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticated(req, res, next);

    expect(req.museumId).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('isAuthenticatedJwtOnly middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws 401 AppError when no token is present', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    expectUnauthorized(() => isAuthenticatedJwtOnly(req, res, next), 'Token required');
  });

  it('rejects msk_ tokens with specific error message', () => {
    const req = { headers: { authorization: 'Bearer msk_someapikey' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    expectUnauthorized(
      () => isAuthenticatedJwtOnly(req, res, next),
      'JWT authentication required for this endpoint',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.user on valid JWT token', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockReturnValue({
      id: 5,
      role: 'admin',
      museumId: null,
    });

    const req = { headers: { authorization: 'Bearer valid-jwt' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticatedJwtOnly(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 5, role: 'admin', museumId: null });
  });

  it('throws 401 AppError when JWT verification throws', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockImplementation(() => {
      throw new Error('expired');
    });

    const req = { headers: { authorization: 'Bearer expired-jwt' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    expectUnauthorized(() => isAuthenticatedJwtOnly(req, res, next), 'Invalid token');
  });
});
