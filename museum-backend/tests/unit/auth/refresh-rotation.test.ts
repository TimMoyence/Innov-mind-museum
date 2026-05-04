/**
 * H1 — Refresh-token sliding idle window.
 *
 * Validates that `AuthSessionService.refresh`:
 *   - accepts rotation within the 14-day idle window,
 *   - rejects rotation once the idle window is exceeded even if the token's
 *     own `expiresAt` is still in the future, and revokes the whole family.
 *
 * Uses shared fixtures from `tests/helpers/auth/` per CLAUDE.md DRY test rules.
 */

import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env } from '@src/config/env';
import { AuthSessionService } from '@modules/auth/useCase/session/authSession.service';
import type { StoredRefreshTokenRow } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeRefreshTokenRepo, makeUserRepo } from '../../helpers/auth/user-repo.mock';

jest.mock('@modules/auth/useCase/session/login-rate-limiter', () => ({
  checkLoginRateLimit: jest.fn(),
  recordFailedLogin: jest.fn(),
  clearLoginAttempts: jest.fn(),
}));

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

const IDLE_WINDOW_MS = env.auth.refreshIdleWindowSeconds * 1000;

/**
 * Build a persisted refresh-token row with sensible defaults for the sliding-window tests.
 * `lastRotatedAt` is the anchor the service uses to decide whether the session is idle.
 * @param overrides
 */
const makeStoredToken = (overrides: Partial<StoredRefreshTokenRow> = {}): StoredRefreshTokenRow => {
  const now = new Date();
  return {
    id: 'tok-1',
    userId: 1,
    jti: 'jti-refresh-1',
    familyId: 'fam-1',
    tokenHash: 'placeholder',
    issuedAt: now,
    // Absolute TTL still valid (30d default).
    expiresAt: new Date(now.getTime() + 30 * 86_400 * 1000),
    rotatedAt: null,
    lastRotatedAt: now,
    revokedAt: null,
    reuseDetectedAt: null,
    replacedByTokenId: null,
    createdAt: now,
    ...overrides,
  };
};

const signRefresh = (jti: string, familyId: string): string =>
  jwt.sign({ sub: '1', type: 'refresh', jti, familyId }, env.auth.refreshTokenSecret, {
    algorithm: 'HS256',
    expiresIn: '30d',
  });

describe('AuthSessionService — refresh-token sliding idle window', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rotation succeeds when last rotation happened within the idle window', async () => {
    const userRepo = makeUserRepo();
    const refreshTokenRepo = makeRefreshTokenRepo();
    userRepo.getUserById.mockResolvedValue(makeUser());

    const service = new AuthSessionService(userRepo, refreshTokenRepo);

    const jti = 'jti-within';
    const familyId = 'fam-within';
    const token = signRefresh(jti, familyId);

    // Anchor 1 hour ago — safely inside the (now 24h) idle window.
    // F8 (2026-04-30) tightened the default from 14d to 24h, so anchors using
    // the previous "~1 day ago" baseline are borderline; use a smaller offset.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    refreshTokenRepo.findByJti.mockResolvedValue(
      makeStoredToken({
        jti,
        familyId,
        tokenHash: sha256(token),
        lastRotatedAt: oneHourAgo,
        createdAt: oneHourAgo,
        issuedAt: oneHourAgo,
      }),
    );

    const result = await service.refresh(token);

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken.split('.')).toHaveLength(3);
    expect(refreshTokenRepo.rotate).toHaveBeenCalledTimes(1);
    // Family must NOT be revoked on a happy-path rotation.
    expect(refreshTokenRepo.revokeFamily).not.toHaveBeenCalled();
  });

  it('rotation beyond the configured idle window is rejected and revokes the family', async () => {
    const userRepo = makeUserRepo();
    const refreshTokenRepo = makeRefreshTokenRepo();
    userRepo.getUserById.mockResolvedValue(makeUser());

    const service = new AuthSessionService(userRepo, refreshTokenRepo);

    const jti = 'jti-idle';
    const familyId = 'fam-idle';
    const token = signRefresh(jti, familyId);

    // Anchor just past the idle threshold — 1 minute over.
    const staleAnchor = new Date(Date.now() - IDLE_WINDOW_MS - 60_000);
    refreshTokenRepo.findByJti.mockResolvedValue(
      makeStoredToken({
        jti,
        familyId,
        tokenHash: sha256(token),
        lastRotatedAt: staleAnchor,
        createdAt: staleAnchor,
        issuedAt: staleAnchor,
      }),
    );

    await expect(service.refresh(token)).rejects.toMatchObject({
      statusCode: 401,
      code: 'SESSION_IDLE_TIMEOUT',
    });

    expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith(familyId);
    // Must NOT have rotated — idle check comes before rotation.
    expect(refreshTokenRepo.rotate).not.toHaveBeenCalled();
  });

  it('falls back to createdAt when lastRotatedAt is null (legacy rows)', async () => {
    const userRepo = makeUserRepo();
    const refreshTokenRepo = makeRefreshTokenRepo();
    userRepo.getUserById.mockResolvedValue(makeUser());

    const service = new AuthSessionService(userRepo, refreshTokenRepo);

    const jti = 'jti-legacy';
    const familyId = 'fam-legacy';
    const token = signRefresh(jti, familyId);

    // Legacy row: lastRotatedAt null, createdAt older than idle window.
    const staleCreatedAt = new Date(Date.now() - IDLE_WINDOW_MS - 5_000);
    refreshTokenRepo.findByJti.mockResolvedValue(
      makeStoredToken({
        jti,
        familyId,
        tokenHash: sha256(token),
        lastRotatedAt: null,
        createdAt: staleCreatedAt,
        issuedAt: staleCreatedAt,
      }),
    );

    await expect(service.refresh(token)).rejects.toMatchObject({
      statusCode: 401,
      code: 'SESSION_IDLE_TIMEOUT',
    });
    expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith(familyId);
  });
});
