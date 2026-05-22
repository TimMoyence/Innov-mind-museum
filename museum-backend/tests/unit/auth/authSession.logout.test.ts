/**
 * RED — T1.8 — R7 — `AuthSessionService.logout` MUST accept an optional access
 * token context `{ accessJti, accessExpSec }` and forward to an injected
 * `IAccessTokenDenylist.add(jti, ttlSec)` when `ttlSec > 0`.
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R7.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.1 + §9 D1/D5/D6 :
 *   - port `IAccessTokenDenylist` injected via constructor.
 *   - `logout(refreshToken, ctx?)` ; pre-existing refresh path preserved.
 *   - `ttlSec = ctx.accessExpSec - floor(now/1000)` ; if <= 0 → no-op.
 *
 * Anchored to PATTERNS / LESSONS :
 *  - `lib-docs/jsonwebtoken/PATTERNS.md` §3.9 DO "rotate refresh tokens with a
 *    `jti` + DB store (replay protection)" — refresh side preserved.
 *  - `lib-docs/jsonwebtoken/PATTERNS.md` §10.A — `jti` already signed in
 *    access token claim (`token-jwt.service.ts:130`).
 *  - `lib-docs/ioredis/PATTERNS.md` §3 DO #6 — `SET ... EX ... NX` for the
 *    add() implementation (asserted in T1.10, NOT here ; this test only
 *    asserts the SERVICE forwards to the port).
 *
 * Failure mode at HEAD `00325d81` :
 *  - `authSession.service.ts:201-213` `logout(refreshToken: string | undefined)`
 *    has 1 arg only ; no `accessTokenDenylist` field exists on the service.
 *  - Constructor accepts (userRepo, refreshRepo, totpRepo?) — no 4th param for
 *    the denylist. The 4-arg construction below fails TS today ; cast pins R7.
 *
 * Run scope :
 *   pnpm jest tests/unit/auth/authSession.logout.test.ts
 */

import jwt from 'jsonwebtoken';

import {
  AuthSessionService,
  type AuthSessionService as AuthSessionServiceType,
} from '@modules/auth/useCase/session/authSession.service';
import { env } from '@src/config/env';

import { makeUserRepo, makeRefreshTokenRepo } from '../../helpers/auth/user-repo.mock';

import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';

process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

/**
 * Future port shape pinned by R7 design §3.1.
 * GREEN phase creates this file under
 *   `src/modules/auth/domain/session/access-token-denylist.port.ts`.
 */
interface IAccessTokenDenylist {
  add(jti: string, ttlSec: number): Promise<void>;
  has(jti: string): Promise<boolean>;
}

interface DenylistSpy extends IAccessTokenDenylist {
  add: jest.Mock<Promise<void>, [string, number]>;
  has: jest.Mock<Promise<boolean>, [string]>;
}

const makeDenylistSpy = (): DenylistSpy => ({
  add: jest.fn().mockResolvedValue(undefined),
  has: jest.fn().mockResolvedValue(false),
});

/**
 * Forge a refresh token that the service can decode without surprise (so the
 * existing `revokeByJti` path is taken). Mirror `token.helpers.ts` patterns.
 */
const makeRefreshToken = (jti = 'refresh-jti-r7'): string =>
  jwt.sign({ sub: '1', type: 'refresh', jti, familyId: 'family-r7' }, env.auth.refreshTokenSecret, {
    algorithm: 'HS256',
    expiresIn: '14d',
    issuer: 'musaium-refresh',
    audience: 'musaium-refresh',
  });

/**
 * Forward-compatible cast — R7 GREEN extends the constructor with a 4th DI
 * param `accessTokenDenylist`. TS on HEAD `00325d81` rejects this signature ;
 * `as any` cast inside the helper is the ONE allowed boundary (we keep `as any`
 * scoped to the constructor wiring, never on entity assertions).
 */
type ServiceCtor4Args = new (
  userRepo: ReturnType<typeof makeUserRepo>,
  refreshRepo: IRefreshTokenRepository,
  totpRepo: undefined,
  accessTokenDenylist: IAccessTokenDenylist,
) => AuthSessionServiceType;

type LogoutWithCtx = (
  refreshToken: string | undefined,
  ctx?: { accessJti: string; accessExpSec: number },
) => Promise<void>;

const NOW_SEC = 1_747_789_200; // 2026-05-21T17:00:00Z UTC

describe('AuthSessionService.logout — access-token denylist DI (R7)', () => {
  let realDateNow: typeof Date.now;
  let userRepo: ReturnType<typeof makeUserRepo>;
  let refreshRepo: ReturnType<typeof makeRefreshTokenRepo>;
  let denylist: DenylistSpy;

  beforeEach(() => {
    realDateNow = Date.now;
    Date.now = () => NOW_SEC * 1000;
    userRepo = makeUserRepo(null);
    refreshRepo = makeRefreshTokenRepo();
    denylist = makeDenylistSpy();
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  const buildService = (): AuthSessionServiceType =>
    new (AuthSessionService as unknown as ServiceCtor4Args)(
      userRepo,
      refreshRepo,
      undefined,
      denylist,
    );

  it('with refreshToken only → calls refreshRepo.revokeByJti, NEVER denylist.add (R7 preserved path)', async () => {
    const svc = buildService();
    const refreshToken = makeRefreshToken('refresh-jti-r7-a');

    await (svc.logout as LogoutWithCtx)(refreshToken);

    expect(refreshRepo.revokeByJti).toHaveBeenCalledTimes(1);
    expect(refreshRepo.revokeByJti).toHaveBeenCalledWith('refresh-jti-r7-a');
    expect(denylist.add).not.toHaveBeenCalled();
  });

  it('with refreshToken + ctx (valid ttl) → calls BOTH revokeByJti AND denylist.add (R7.a)', async () => {
    const svc = buildService();
    const refreshToken = makeRefreshToken('refresh-jti-r7-b');
    const accessExpSec = NOW_SEC + 600; // 10 minutes remaining

    await (svc.logout as LogoutWithCtx)(refreshToken, {
      accessJti: 'access-jti-r7-b',
      accessExpSec,
    });

    expect(refreshRepo.revokeByJti).toHaveBeenCalledTimes(1);
    expect(denylist.add).toHaveBeenCalledTimes(1);
    expect(denylist.add).toHaveBeenCalledWith('access-jti-r7-b', 600);
  });

  it('with ctx where ttl <= 0 (token already expired) → SKIPS denylist.add (R7 idempotent, design §3.1 D)', async () => {
    const svc = buildService();
    const refreshToken = makeRefreshToken('refresh-jti-r7-c');
    const accessExpSec = NOW_SEC - 10; // ALREADY expired

    await (svc.logout as LogoutWithCtx)(refreshToken, {
      accessJti: 'access-jti-r7-c',
      accessExpSec,
    });

    expect(refreshRepo.revokeByJti).toHaveBeenCalledTimes(1);
    expect(denylist.add).not.toHaveBeenCalled();
  });

  it('with ctx but UNDEFINED refreshToken → still calls denylist.add on the access token (R7 access-only logout)', async () => {
    const svc = buildService();
    const accessExpSec = NOW_SEC + 300;

    await (svc.logout as LogoutWithCtx)(undefined, {
      accessJti: 'access-jti-r7-d',
      accessExpSec,
    });

    expect(refreshRepo.revokeByJti).not.toHaveBeenCalled();
    expect(denylist.add).toHaveBeenCalledTimes(1);
    expect(denylist.add).toHaveBeenCalledWith('access-jti-r7-d', 300);
  });
});
