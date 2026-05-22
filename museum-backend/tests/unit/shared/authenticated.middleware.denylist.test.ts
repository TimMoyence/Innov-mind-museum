/**
 * RED — T1.9 — R8 — `isAuthenticated` / `isAuthenticatedJwtOnly` MUST reject
 * a revoked access token (jti in denylist) with HTTP 401 `code: 'TOKEN_REVOKED'`.
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R8.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.1 :
 *   - new method `verifyAccessTokenWithClaims` exposes `{ id, role, museumId, jti, expSec }`.
 *   - middleware calls denylist.has(jti) AFTER successful verify.
 *   - module-level `setAccessTokenDenylist(d)` wired by composition root.
 *
 * Anchored to PATTERNS / LESSONS :
 *  - `lib-docs/jsonwebtoken/PATTERNS.md` §10.A access verify pinned
 *    `algorithms:['HS256']`, `iss/aud` `'musaium-access'` — preserved.
 *  - `lib-docs/ioredis/PATTERNS.md` §3 DO #6 — `EXISTS` check is the read path
 *    in the adapter (covered by T1.10).
 *
 * Failure mode at HEAD `00325d81` :
 *  - `authenticated.middleware.ts:35-79` calls `verifyAccessToken(token)` (no
 *    `WithClaims` variant) and does NOT consult any denylist port. Setter
 *    `setAccessTokenDenylist` doesn't exist → re-import would throw on access.
 *  - The test asserts the future `code: 'TOKEN_REVOKED'` response shape, which
 *    no path currently produces.
 *
 * Run scope :
 *   pnpm jest tests/unit/shared/authenticated.middleware.denylist.test.ts
 */

import { AppError } from '@shared/errors/app.error';

import {
  makePartialRequest,
  makePartialResponse,
  makeNext,
} from '../../helpers/http/express-mock.helpers';

// Mock the auth session service BEFORE importing the middleware.
jest.mock('@modules/auth/useCase', () => ({
  authSessionService: {
    verifyAccessToken: jest.fn(),
    // R8 — new method. Today's service doesn't expose it ; this mock provides
    // the contract pin for green-phase.
    verifyAccessTokenWithClaims: jest.fn(),
  },
}));

jest.mock('@shared/observability/sentry', () => ({
  setUser: jest.fn(),
}));

jest.mock('@shared/middleware/apiKey.middleware', () => ({
  validateApiKey: jest.fn(),
}));

import {
  isAuthenticated,
  isAuthenticatedJwtOnly,
} from '@shared/middleware/authenticated.middleware';
import { authSessionService as rawAuthSessionService } from '@modules/auth/useCase';

/**
 * The R8 GREEN phase adds `verifyAccessTokenWithClaims` to `AuthSessionService`.
 * Until then the property doesn't exist on the type ; this cast lets the test
 * pin the future shape without an `@ts-expect-error` (which would self-heal
 * when the prod type lands and break frozen-test).
 */
const authSessionService = rawAuthSessionService as typeof rawAuthSessionService & {
  verifyAccessTokenWithClaims: jest.Mock;
};

/**
 * R8 design §3.1 D9 — denylist setter wired at module-level by composition root.
 * Green-phase adds `export const setAccessTokenDenylist = (d) => { … }`. The
 * dynamic require pins that contract.
 */
interface IAccessTokenDenylist {
  add(jti: string, ttlSec: number): Promise<void>;
  has(jti: string): Promise<boolean>;
}

const requireMiddlewareModule = (): {
  setAccessTokenDenylist?: (d: IAccessTokenDenylist) => void;
} => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- setter is a future export ; require lets us probe without TS error
  return require('@shared/middleware/authenticated.middleware') as {
    setAccessTokenDenylist?: (d: IAccessTokenDenylist) => void;
  };
};

const installDenylist = (denylist: IAccessTokenDenylist): void => {
  const mod = requireMiddlewareModule();
  if (typeof mod.setAccessTokenDenylist !== 'function') {
    // Green-phase MUST export this. Surface a clear failure if it's missing.
    throw new Error('setAccessTokenDenylist not exported by authenticated.middleware');
  }
  mod.setAccessTokenDenylist(denylist);
};

interface RevokedAppErrorShape {
  statusCode: number;
  code: string;
  message: string;
}

const expectAppErrorMatching = (fn: () => void, shape: Partial<RevokedAppErrorShape>): void => {
  try {
    fn();
    throw new Error('Expected AppError to be thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    if (shape.statusCode !== undefined) {
      expect((error as AppError).statusCode).toBe(shape.statusCode);
    }
    if (shape.code !== undefined) {
      expect((error as AppError).code).toBe(shape.code);
    }
  }
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

      // Middleware is sync in `next()` shape ; async denylist is awaited internally
      // (R8 design : middleware becomes async). We await the result of invoking.
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

      // The middleware throws synchronously OR rejects via next(err) — accept both.
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
        // next(err) async path
        expect(next).toHaveBeenCalledTimes(1);
        const errArg = (next as jest.Mock).mock.calls[0][0] as unknown;
        expect(errArg).toBeInstanceOf(AppError);
        expect((errArg as AppError).statusCode).toBe(401);
        expect((errArg as AppError).code).toBe('TOKEN_REVOKED');
      }
    });
  });

  describe('isAuthenticatedJwtOnly', () => {
    it('denylist.has=true → throws 401 TOKEN_REVOKED on JWT-only path (R8.b — same coverage)', async () => {
      (authSessionService.verifyAccessTokenWithClaims as jest.Mock).mockReturnValue({
        id: 8,
        role: 'admin',
        museumId: null,
        jti: 'access-jti-revoked-jwtonly',
        expSec: Math.floor(Date.now() / 1000) + 600,
      });
      installDenylist({
        add: jest.fn().mockResolvedValue(undefined),
        has: jest.fn().mockResolvedValue(true),
      });

      const req = makePartialRequest({ headers: { authorization: 'Bearer revoked-jwt' } });
      const res = makePartialResponse();
      const next = makeNext();

      let caught: unknown;
      try {
        await Promise.resolve(isAuthenticatedJwtOnly(req, res, next));
      } catch (e) {
        caught = e;
      }

      if (caught) {
        expectAppErrorMatching(
          () => {
            throw caught as Error;
          },
          { statusCode: 401, code: 'TOKEN_REVOKED' },
        );
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
