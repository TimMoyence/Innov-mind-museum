import jwt from 'jsonwebtoken';

import {
  AuthSessionService,
  type AuthSessionService as AuthSessionServiceType,
} from '@modules/auth/useCase/session/authSession.service';
import { env } from '@src/config/env';

import { makeUserRepo, makeRefreshTokenRepo } from '../../helpers/auth/user-repo.mock';

process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

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

const makeRefreshToken = (jti = 'refresh-jti-r7'): string =>
  jwt.sign({ sub: '1', type: 'refresh', jti, familyId: 'family-r7' }, env.auth.refreshTokenSecret, {
    algorithm: 'HS256',
    expiresIn: '14d',
    issuer: 'musaium-refresh',
    audience: 'musaium-refresh',
  });

type LogoutWithCtx = (
  refreshToken: string | undefined,
  ctx?: { accessJti: string; accessExpSec: number },
) => Promise<void>;

const NOW_SEC = 1_747_789_200;

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
    new AuthSessionService(userRepo, refreshRepo, denylist);

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
    const accessExpSec = NOW_SEC + 600;

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
    const accessExpSec = NOW_SEC - 10;

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
