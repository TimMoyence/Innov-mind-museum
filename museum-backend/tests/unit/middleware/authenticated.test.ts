import { AppError } from '@shared/errors/app.error';
import {
  makePartialRequest,
  makePartialResponse,
  makeNext,
} from '../../helpers/http/express-mock.helpers';

jest.mock('@modules/auth/useCase', () => ({
  authSessionService: {
    verifyAccessToken: jest.fn(),
    verifyAccessTokenWithClaims: jest.fn(),
  },
}));

jest.mock('@shared/observability/sentry', () => ({
  setUser: jest.fn(),
}));

import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { authSessionService } from '@modules/auth/useCase';

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
