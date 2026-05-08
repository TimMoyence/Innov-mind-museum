/**
 * Unit tests for `SessionIssuerService` — banking-grade refresh-token rotation
 * contract. Pinned co-Stryker hot file with `refresh-token.repository.pg.ts`.
 *
 * Public surface covered:
 *   - `issueSession(...)`       fresh issue (insert path) and rotation
 *                               (rotate path with `rotateFrom`).
 *   - `assertRefreshTokenUsable(...)` enforces hash match, no-revoked,
 *                               no-rotated, no-reuse-detected, not-expired,
 *                               and sliding idle-window before next rotation.
 *
 * Test categories:
 *   - Happy path (insert): JWT pair claims, refresh.exp > access.exp,
 *     persisted row carries the correct sha256 hash + family + jti
 *     (the very same that was signed into the JWT).
 *   - Happy path (rotation): familyId preserved, parent token id passed to
 *     `rotate()`, fresh access+refresh JWTs distinct from the previous pair.
 *   - MFA-warning passthrough into the response envelope.
 *   - Reuse detection (hash mismatch) revokes the family with reuseDetected=true.
 *   - Reuse detection (already revoked / rotated / reuse-flagged row) does the
 *     same — three branches verified independently.
 *   - Expiry: revokeByJti + REFRESH_TOKEN_EXPIRED.
 *   - Sliding idle-window: lastRotatedAt anchor and createdAt fallback both
 *     trigger SESSION_IDLE_TIMEOUT and revokeFamily without reuse=true.
 *   - 401 status code + AppError shape on every enforcement failure.
 *
 * Per CLAUDE.md DRY rule: shared `makeUser` factory + shared
 * `makeRefreshTokenRepo` mock. No inline entity creation.
 */

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';
import { SessionIssuerService } from '@modules/auth/useCase/session/session-issuer.service';
import { TokenJwtService } from '@modules/auth/useCase/session/token-jwt.service';
import type { StoredRefreshTokenRow } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeRefreshTokenRepo } from '../../helpers/auth/user-repo.mock';

// ── Fixtures ───────────────────────────────────────────────────────

const REFRESH_IDLE_WINDOW_SECONDS = 60 * 60 * 24 * 7; // 7 days

const toSafeUser = (overrides: Parameters<typeof makeUser>[0] = {}) => {
  const u = makeUser(overrides);
  return {
    id: u.id,
    email: u.email,
    firstname: u.firstname,
    lastname: u.lastname,
    role: u.role,
    museumId: u.museumId ?? null,
    onboardingCompleted: u.onboarding_completed,
  };
};

const makeStoredToken = (
  overrides: Partial<StoredRefreshTokenRow> = {},
): StoredRefreshTokenRow => ({
  id: 'tok-1',
  userId: 1,
  jti: 'refresh-jti-1',
  familyId: 'family-1',
  tokenHash: 'placeholder-hash',
  issuedAt: new Date(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30d future
  rotatedAt: null,
  lastRotatedAt: new Date(),
  revokedAt: null,
  reuseDetectedAt: null,
  replacedByTokenId: null,
  createdAt: new Date(),
  ...overrides,
});

const makeIssuer = () => {
  const repo = makeRefreshTokenRepo();
  const tokenJwt = new TokenJwtService();
  const service = new SessionIssuerService(repo, tokenJwt, REFRESH_IDLE_WINDOW_SECONDS);
  return { service, repo, tokenJwt };
};

const expectAppErrorAsync = async (fn: () => Promise<unknown>): Promise<AppError> => {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw new Error(`Expected AppError, got: ${String(error)}`, { cause: error });
    }
    return error;
  }
  throw new Error('Expected promise to reject with AppError, but it did not');
};

// ── Tests ──────────────────────────────────────────────────────────

describe('SessionIssuerService — issueSession (fresh issue / insert path)', () => {
  it('signs an access+refresh pair with consistent claims and persists via insert()', async () => {
    const { service, repo, tokenJwt } = makeIssuer();
    const user = toSafeUser({ id: 42, role: 'visitor', museumId: null });

    const result = await service.issueSession({ user });

    // Envelope shape
    expect(result.user).toBe(user);
    expect(result.expiresIn).toBe(tokenJwt.accessTtlSeconds);
    expect(result.refreshExpiresIn).toBe(tokenJwt.refreshTtlSeconds);
    expect(result.mfaWarningDaysRemaining).toBeUndefined();

    // Access claims
    const access = jwt.verify(result.accessToken, env.auth.accessTokenSecret) as JwtPayload;
    expect(access.sub).toBe('42');
    expect(access.type).toBe('access');
    expect(typeof access.jti).toBe('string');
    expect(access.role).toBe('visitor');

    // Refresh claims
    const refresh = jwt.verify(result.refreshToken, env.auth.refreshTokenSecret) as JwtPayload & {
      familyId: string;
    };
    expect(refresh.sub).toBe('42');
    expect(refresh.type).toBe('refresh');
    expect(typeof refresh.jti).toBe('string');
    expect(typeof refresh.familyId).toBe('string');

    // Persisted row mirrors the signed refresh JWT
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.rotate).not.toHaveBeenCalled();
    const persisted = repo.insert.mock.calls[0][0];
    expect(persisted.userId).toBe(42);
    expect(persisted.jti).toBe(refresh.jti);
    expect(persisted.familyId).toBe(refresh.familyId);
    expect(persisted.tokenHash).toBe(tokenJwt.sha256(result.refreshToken));
    expect(persisted.issuedAt).toBeInstanceOf(Date);
    expect(persisted.expiresAt).toBeInstanceOf(Date);
    expect(persisted.lastRotatedAt).toBeInstanceOf(Date);
    expect(persisted.lastRotatedAt!.getTime()).toBe(persisted.issuedAt.getTime());
  });

  it('issues a refresh JWT whose exp is strictly later than the access JWT exp', async () => {
    const { service } = makeIssuer();
    const result = await service.issueSession({ user: toSafeUser() });

    const access = jwt.decode(result.accessToken) as JwtPayload;
    const refresh = jwt.decode(result.refreshToken) as JwtPayload;
    expect(refresh.exp).toBeGreaterThan(access.exp!);
  });

  it('persists expiresAt close to now + refreshTtlSeconds', async () => {
    const { service, repo, tokenJwt } = makeIssuer();
    const before = Date.now();

    await service.issueSession({ user: toSafeUser() });

    const after = Date.now();
    const persisted = repo.insert.mock.calls[0][0];
    const expected = persisted.issuedAt.getTime() + tokenJwt.refreshTtlSeconds * 1000;
    // Generous bounds: persisted expiresAt computed from Date.now() at call,
    // issuedAt also from Date.now(); they're at most a few ms apart.
    expect(persisted.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + tokenJwt.refreshTtlSeconds * 1000 - 50,
    );
    expect(persisted.expiresAt.getTime()).toBeLessThanOrEqual(
      after + tokenJwt.refreshTtlSeconds * 1000 + 50,
    );
    // Match the absolute formula the service uses (issuedAt + ttl).
    expect(Math.abs(persisted.expiresAt.getTime() - expected)).toBeLessThan(1000);
  });

  it('uses a caller-supplied familyId when provided', async () => {
    const { service, repo } = makeIssuer();

    const result = await service.issueSession({
      user: toSafeUser(),
      familyId: 'fam-explicit',
    });

    const refresh = jwt.decode(result.refreshToken) as JwtPayload & { familyId: string };
    expect(refresh.familyId).toBe('fam-explicit');
    expect(repo.insert.mock.calls[0][0].familyId).toBe('fam-explicit');
  });

  it('generates a fresh familyId per call when omitted', async () => {
    const { service } = makeIssuer();
    const r1 = await service.issueSession({ user: toSafeUser() });
    const r2 = await service.issueSession({ user: toSafeUser() });

    const f1 = (jwt.decode(r1.refreshToken) as JwtPayload & { familyId: string }).familyId;
    const f2 = (jwt.decode(r2.refreshToken) as JwtPayload & { familyId: string }).familyId;
    expect(f1).not.toBe(f2);
  });

  it('generates distinct access JTI and refresh JTI per session', async () => {
    const { service } = makeIssuer();
    const result = await service.issueSession({ user: toSafeUser() });
    const access = jwt.decode(result.accessToken) as JwtPayload;
    const refresh = jwt.decode(result.refreshToken) as JwtPayload;
    expect(access.jti).not.toBe(refresh.jti);
  });

  it('passes mfaWarningDaysRemaining into the response when supplied', async () => {
    const { service } = makeIssuer();
    const result = await service.issueSession({
      user: toSafeUser({ role: 'admin' }),
      mfaWarningDaysRemaining: 3,
    });
    expect(result.mfaWarningDaysRemaining).toBe(3);
  });

  it('does NOT include mfaWarningDaysRemaining key when undefined (no leak of optional)', async () => {
    const { service } = makeIssuer();
    const result = await service.issueSession({ user: toSafeUser() });
    expect(Object.prototype.hasOwnProperty.call(result, 'mfaWarningDaysRemaining')).toBe(false);
  });

  it('embeds museumId into access claims for museum_manager role', async () => {
    const { service } = makeIssuer();
    const result = await service.issueSession({
      user: toSafeUser({ role: 'museum_manager', museumId: 99 }),
    });
    const access = jwt.decode(result.accessToken) as JwtPayload & { museumId?: number };
    expect(access.museumId).toBe(99);
    expect(access.role).toBe('museum_manager');
  });
});

describe('SessionIssuerService — issueSession (rotation / rotate path)', () => {
  it('routes to repo.rotate() when rotateFrom is provided, preserving familyId chain', async () => {
    const { service, repo } = makeIssuer();
    const parent = makeStoredToken({
      id: 'parent-id',
      familyId: 'fam-chain',
      jti: 'parent-jti',
    });

    const result = await service.issueSession({
      user: toSafeUser(),
      familyId: parent.familyId,
      rotateFrom: parent,
    });

    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.rotate).toHaveBeenCalledTimes(1);

    const rotateArgs = repo.rotate.mock.calls[0][0];
    expect(rotateArgs.currentTokenId).toBe('parent-id');
    expect(rotateArgs.next.familyId).toBe('fam-chain');
    expect(rotateArgs.next.jti).not.toBe('parent-jti');

    const newRefresh = jwt.decode(result.refreshToken) as JwtPayload & { familyId: string };
    expect(newRefresh.familyId).toBe('fam-chain');
    // The persisted next.jti must be exactly the jti embedded in the new JWT.
    expect(rotateArgs.next.jti).toBe(newRefresh.jti);
  });

  it('produces a NEW refresh token distinct from the parent (rotation breaks token equality)', async () => {
    const { service, tokenJwt } = makeIssuer();
    const parentToken = tokenJwt.signRefreshToken({
      userId: 1,
      jti: 'parent-jti',
      familyId: 'fam-rot',
    });
    const parent = makeStoredToken({
      id: 'parent-id',
      familyId: 'fam-rot',
      jti: 'parent-jti',
      tokenHash: tokenJwt.sha256(parentToken),
    });

    const result = await service.issueSession({
      user: toSafeUser(),
      familyId: parent.familyId,
      rotateFrom: parent,
    });

    expect(result.refreshToken).not.toBe(parentToken);
    expect(tokenJwt.sha256(result.refreshToken)).not.toBe(parent.tokenHash);
  });
});

describe('SessionIssuerService — assertRefreshTokenUsable (rotation contract enforcement)', () => {
  it('passes silently for a healthy stored row whose hash matches the provided token', async () => {
    const { service, tokenJwt, repo } = makeIssuer();
    const token = tokenJwt.signRefreshToken({ userId: 1, jti: 'j', familyId: 'f' });
    const stored = makeStoredToken({ tokenHash: tokenJwt.sha256(token) });

    await expect(service.assertRefreshTokenUsable(stored, token)).resolves.toBeUndefined();

    expect(repo.revokeFamily).not.toHaveBeenCalled();
    expect(repo.revokeByJti).not.toHaveBeenCalled();
  });

  it('revokes the family (reuse=true) and throws REFRESH_TOKEN_REUSE_DETECTED on hash mismatch', async () => {
    const { service, repo } = makeIssuer();
    const stored = makeStoredToken({ tokenHash: 'a-hash-that-doesnt-match' });

    const err = await expectAppErrorAsync(() =>
      service.assertRefreshTokenUsable(stored, 'whatever-token'),
    );
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');
    expect(repo.revokeFamily).toHaveBeenCalledWith(stored.familyId, true);
  });

  it('revokes the family (reuse=true) when the row was already revoked', async () => {
    const { service, tokenJwt, repo } = makeIssuer();
    const token = tokenJwt.signRefreshToken({ userId: 1, jti: 'j', familyId: 'fam-rev' });
    const stored = makeStoredToken({
      familyId: 'fam-rev',
      tokenHash: tokenJwt.sha256(token),
      revokedAt: new Date(),
    });

    const err = await expectAppErrorAsync(() => service.assertRefreshTokenUsable(stored, token));
    expect(err.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');
    expect(repo.revokeFamily).toHaveBeenCalledWith('fam-rev', true);
  });

  it('revokes the family (reuse=true) when the row was already rotated (replay)', async () => {
    const { service, tokenJwt, repo } = makeIssuer();
    const token = tokenJwt.signRefreshToken({ userId: 1, jti: 'j', familyId: 'fam-rot' });
    const stored = makeStoredToken({
      familyId: 'fam-rot',
      tokenHash: tokenJwt.sha256(token),
      rotatedAt: new Date(),
    });

    const err = await expectAppErrorAsync(() => service.assertRefreshTokenUsable(stored, token));
    expect(err.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');
    expect(repo.revokeFamily).toHaveBeenCalledWith('fam-rot', true);
  });

  it('revokes the family (reuse=true) when reuseDetectedAt is already set on the row', async () => {
    const { service, tokenJwt, repo } = makeIssuer();
    const token = tokenJwt.signRefreshToken({ userId: 1, jti: 'j', familyId: 'fam-flagged' });
    const stored = makeStoredToken({
      familyId: 'fam-flagged',
      tokenHash: tokenJwt.sha256(token),
      reuseDetectedAt: new Date(),
    });

    const err = await expectAppErrorAsync(() => service.assertRefreshTokenUsable(stored, token));
    expect(err.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');
    expect(repo.revokeFamily).toHaveBeenCalledWith('fam-flagged', true);
  });

  it('revokes by JTI (NOT family) and throws REFRESH_TOKEN_EXPIRED when expiresAt is in the past', async () => {
    const { service, tokenJwt, repo } = makeIssuer();
    const token = tokenJwt.signRefreshToken({ userId: 1, jti: 'jti-exp', familyId: 'fam-exp' });
    const stored = makeStoredToken({
      jti: 'jti-exp',
      familyId: 'fam-exp',
      tokenHash: tokenJwt.sha256(token),
      expiresAt: new Date(Date.now() - 1000),
    });

    const err = await expectAppErrorAsync(() => service.assertRefreshTokenUsable(stored, token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('REFRESH_TOKEN_EXPIRED');
    expect(repo.revokeByJti).toHaveBeenCalledWith('jti-exp');
    expect(repo.revokeFamily).not.toHaveBeenCalled();
  });

  it('revokes the family (reuse=false) and throws SESSION_IDLE_TIMEOUT when lastRotatedAt is older than the window', async () => {
    const { service, tokenJwt, repo } = makeIssuer();
    const token = tokenJwt.signRefreshToken({ userId: 1, jti: 'j', familyId: 'fam-idle' });
    const past = new Date(Date.now() - (REFRESH_IDLE_WINDOW_SECONDS + 60) * 1000);
    const stored = makeStoredToken({
      familyId: 'fam-idle',
      tokenHash: tokenJwt.sha256(token),
      lastRotatedAt: past,
    });

    const err = await expectAppErrorAsync(() => service.assertRefreshTokenUsable(stored, token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('SESSION_IDLE_TIMEOUT');
    expect(repo.revokeFamily).toHaveBeenCalledWith('fam-idle');
    // Critically: idle timeout is NOT reuse → second arg must NOT be `true`.
    expect(repo.revokeFamily).not.toHaveBeenCalledWith('fam-idle', true);
  });

  it('falls back to createdAt when lastRotatedAt is null (legacy row) and triggers idle timeout if too old', async () => {
    const { service, tokenJwt, repo } = makeIssuer();
    const token = tokenJwt.signRefreshToken({ userId: 1, jti: 'j', familyId: 'fam-legacy' });
    const past = new Date(Date.now() - (REFRESH_IDLE_WINDOW_SECONDS + 60) * 1000);
    const stored = makeStoredToken({
      familyId: 'fam-legacy',
      tokenHash: tokenJwt.sha256(token),
      lastRotatedAt: null,
      createdAt: past,
    });

    const err = await expectAppErrorAsync(() => service.assertRefreshTokenUsable(stored, token));
    expect(err.code).toBe('SESSION_IDLE_TIMEOUT');
    expect(repo.revokeFamily).toHaveBeenCalledWith('fam-legacy');
  });

  it('passes when lastRotatedAt is exactly at the boundary (idleMs === window → not greater than)', async () => {
    const { service, tokenJwt, repo } = makeIssuer();
    jest.useFakeTimers();
    try {
      const now = new Date('2026-01-01T00:00:00Z');
      jest.setSystemTime(now);

      const token = tokenJwt.signRefreshToken({ userId: 1, jti: 'j', familyId: 'fam-edge' });
      const stored = makeStoredToken({
        familyId: 'fam-edge',
        tokenHash: tokenJwt.sha256(token),
        // exactly window-ms ago → idleMs === window → must NOT trigger.
        lastRotatedAt: new Date(now.getTime() - REFRESH_IDLE_WINDOW_SECONDS * 1000),
      });

      await expect(service.assertRefreshTokenUsable(stored, token)).resolves.toBeUndefined();
      expect(repo.revokeFamily).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('checks hash mismatch BEFORE flag-based reuse (mismatch wins when both apply)', async () => {
    const { service, repo } = makeIssuer();
    // Hash mismatch AND already revoked: hash mismatch path runs first (per
    // source ordering), so we still revoke with reuse=true — same outcome
    // structurally. We assert exactly one revokeFamily call to pin the order.
    const stored = makeStoredToken({
      tokenHash: 'mismatch',
      revokedAt: new Date(),
    });

    await expectAppErrorAsync(() => service.assertRefreshTokenUsable(stored, 'tok'));
    expect(repo.revokeFamily).toHaveBeenCalledTimes(1);
    expect(repo.revokeFamily).toHaveBeenCalledWith(stored.familyId, true);
    expect(repo.revokeByJti).not.toHaveBeenCalled();
  });
});
