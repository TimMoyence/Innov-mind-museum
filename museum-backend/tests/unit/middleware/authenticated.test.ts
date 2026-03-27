import type { Request, Response, NextFunction } from 'express';

// Mock the auth session service BEFORE importing the middleware
jest.mock('@modules/auth/core/useCase', () => ({
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
import { authSessionService } from '@modules/auth/core/useCase';

const mockRes = (): Response => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

describe('isAuthenticated middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no Authorization header is present', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticated(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Token required' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header has no Bearer token', () => {
    const req = { headers: { authorization: 'Bearer' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticated(req, res, next);

    // split('Bearer')[1] is undefined
    expect(res.status).toHaveBeenCalledWith(401);
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

  it('returns 401 when JWT verification throws', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockImplementation(() => {
      throw new Error('invalid token');
    });

    const req = { headers: { authorization: 'Bearer bad-jwt' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticated(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('handles msk_ token — falls through to JWT when apiKeys flag is false', () => {
    // In test env, apiKeys flag is false, so msk_ tokens should fall to JWT
    (authSessionService.verifyAccessToken as jest.Mock).mockImplementation(() => {
      throw new Error('not a JWT');
    });

    const req = { headers: { authorization: 'Bearer msk_testkey123' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticated(req, res, next);

    // Should fail as JWT since apiKeys is not enabled
    expect(res.status).toHaveBeenCalledWith(401);
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

  it('returns 401 when no token is present', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticatedJwtOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Token required' },
    });
  });

  it('rejects msk_ tokens with specific error message', () => {
    const req = { headers: { authorization: 'Bearer msk_someapikey' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticatedJwtOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'JWT authentication required for this endpoint' },
    });
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

  it('returns 401 when JWT verification throws', () => {
    (authSessionService.verifyAccessToken as jest.Mock).mockImplementation(() => {
      throw new Error('expired');
    });

    const req = { headers: { authorization: 'Bearer expired-jwt' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    isAuthenticatedJwtOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
    });
  });
});
