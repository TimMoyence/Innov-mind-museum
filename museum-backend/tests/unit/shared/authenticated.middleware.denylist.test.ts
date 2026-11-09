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
import { authSessionService as rawAuthSessionService } from '@modules/auth/useCase';

const authSessionService = rawAuthSessionService as typeof rawAuthSessionService & {
  verifyAccessTokenWithClaims: jest.Mock;
};

interface IAccessTokenDenylist {
  add(jti: string, ttlSec: number): Promise<void>;
  has(jti: string): Promise<boolean>;
}

const requireMiddlewareModule = (): {
  setAccessTokenDenylist?: (d: IAccessTokenDenylist) => void;
} => {
  return require('@shared/middleware/authenticated.middleware') as {
    setAccessTokenDenylist?: (d: IAccessTokenDenylist) => void;
  };
};

const installDenylist = (denylist: IAccessTokenDenylist): void => {
  const mod = requireMiddlewareModule();
  if (typeof mod.setAccessTokenDenylist !== 'function') {
    throw new Error('setAccessTokenDenylist not exported by authenticated.middleware');
  }
  mod.setAccessTokenDenylist(denylist);
};

describe('authenticated.middleware — access-token denylist (R8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isAuthenticated', () => {
    it('denylist.has=false → calls next() and populates req.user (R8 nominal)', async () => {
      (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockReturnValue({
        id: 7,
        role: 'visitor',
        museumId: null,
        jti: 'access-jti-clean',
        expSec: Math.floor(Date.now() / 1000) + 600,
      });
      installDenylist({
        add: jest.fn().mockResolvedValue(undefined),
        has: jest.fn().mockResolvedValue(false),
      });

      const req = makePartialRequest({ headers: { authorization: 'Bearer valid-jwt' } });
      const res = makePartialResponse();
      const next = makeNext();

      await Promise.resolve(isAuthenticated(req, res, next));

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toEqual(expect.objectContaining({ id: 7, role: 'visitor' }));
    });

    it('denylist.has=true → throws 401 TOKEN_REVOKED, next NOT called (R8.a)', async () => {
      (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockReturnValue({
        id: 7,
        role: 'visitor',
        museumId: null,
        jti: 'access-jti-revoked',
        expSec: Math.floor(Date.now() / 1000) + 600,
      });
      installDenylist({
        add: jest.fn().mockResolvedValue(undefined),
        has: jest.fn(async (jti: string) => jti === 'access-jti-revoked'),
      });

      const req = makePartialRequest({ headers: { authorization: 'Bearer revoked-jwt' } });
      const res = makePartialResponse();
      const next = makeNext();

      let caught: unknown;
      try {
        await Promise.resolve(isAuthenticated(req, res, next));
      } catch (e) {
        caught = e;
      }

      if (caught) {
        expect(caught).toBeInstanceOf(AppError);
        expect((caught as AppError).statusCode).toBe(401);
        expect((caught as AppError).code).toBe('TOKEN_REVOKED');
      } else {
        expect(next).toHaveBeenCalledTimes(1);
        const errArg = (next as jest.Mock).mock.calls[0][0] as unknown;
        expect(errArg).toBeInstanceOf(AppError);
        expect((errArg as AppError).statusCode).toBe(401);
        expect((errArg as AppError).code).toBe('TOKEN_REVOKED');
      }
    });
  });
});
