import bcrypt from 'bcrypt';

import { AuthSessionService } from '@modules/auth/useCase/session/authSession.service';
import { ChallengeMfaUseCase } from '@modules/auth/useCase/totp/challengeMfa.useCase';
import { DisableMfaUseCase } from '@modules/auth/useCase/totp/disableMfa.useCase';
import { EnrollMfaUseCase } from '@modules/auth/useCase/totp/enrollMfa.useCase';
import { issueMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';
import { RecoveryMfaUseCase } from '@modules/auth/useCase/totp/recoveryMfa.useCase';
import { decryptTotpSecret } from '@modules/auth/useCase/totp/totpEncryption';
import { verifyTotpCode } from '@modules/auth/useCase/totp/totpService';
import { VerifyMfaUseCase } from '@modules/auth/useCase/totp/verifyMfa.useCase';
import { env } from '@src/config/env';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeRefreshTokenRepo, makeUserRepo } from '../../helpers/auth/user-repo.mock';
import { InMemoryTotpSecretRepository } from '../../helpers/auth/mfa-fixtures';

import * as OTPAuth from 'otpauth';

import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

/**
 * R16 MFA flow — covers the eight policy branches from the W2.T4 mandate
 * exercising the use cases against in-memory repositories. Pure happy-path
 * orchestration (no HTTP layer); the route-level rate limit + audit logging
 * are exercised separately.
 */

// jsonwebtoken `expiresIn` requires a numeric/short-string TTL — fix here so
// the AuthSessionService constructor's `ttlToSeconds` reads a valid window.
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const passwordHash = (plain: string) => bcrypt.hashSync(plain, 4);

/**
 * Build an admin User record. The `mfaEnrollmentDeadline` argument is the
 * ONE field the warning-window scenarios twiddle.
 * @param overrides
 */
function adminUser(overrides: Partial<User> = {}): User {
  return makeUser({
    id: 100,
    email: 'admin@musaium.test',
    role: 'admin',
    password: passwordHash('Adm1nP@ss'),
    email_verified: true,
    ...overrides,
  });
}

/**
 * Tiny stateful userRepo: getUserByEmail reads from a Map keyed by email.
 * @param initialUsers
 */
function statefulUserRepo(initialUsers: User[]): jest.Mocked<IUserRepository> {
  const byEmail = new Map(initialUsers.map((u) => [u.email, u]));
  const byId = new Map(initialUsers.map((u) => [u.id, u]));
  return makeUserRepo(initialUsers[0] ?? null, {
    getUserByEmail: jest.fn(async (email: string) => byEmail.get(email) ?? null),
    getUserById: jest.fn(async (id: number) => byId.get(id) ?? null),
    setMfaEnrollmentDeadline: jest.fn(async (id: number, deadline: Date | null) => {
      const user = byId.get(id);
      if (user) user.mfaEnrollmentDeadline = deadline;
    }),
  });
}

describe('MFA flow — R16', () => {
  describe('warning-window login policy', () => {
    it('first admin login post-deploy stamps deadline = now + 30d and surfaces banner=30', async () => {
      const user = adminUser({ mfaEnrollmentDeadline: null });
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      const result = await svc.login(user.email, 'Adm1nP@ss');

      expect('accessToken' in result).toBe(true);
      if (!('accessToken' in result)) throw new Error('expected session');
      expect(result.mfaWarningDaysRemaining).toBe(env.auth.mfaEnrollmentWarningDays);
      expect(user.mfaEnrollmentDeadline).toBeInstanceOf(Date);
      const expected = Date.now() + env.auth.mfaEnrollmentWarningDays * 86_400_000;
      expect(user.mfaEnrollmentDeadline!.getTime()).toBeGreaterThan(expected - 5_000);
    });

    it('admin inside the warning window keeps logging in, banner shows N days', async () => {
      const remainingDays = 5;
      const user = adminUser({
        mfaEnrollmentDeadline: new Date(Date.now() + remainingDays * 86_400_000),
      });
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      const result = await svc.login(user.email, 'Adm1nP@ss');
      expect('accessToken' in result).toBe(true);
      if (!('accessToken' in result)) throw new Error('expected session');
      expect(result.mfaWarningDaysRemaining).toBe(remainingDays);
    });

    it('admin past the deadline gets mfaEnrollmentRequired (no JWTs)', async () => {
      const user = adminUser({
        mfaEnrollmentDeadline: new Date(Date.now() - 1_000),
      });
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      const result = await svc.login(user.email, 'Adm1nP@ss');
      expect('mfaEnrollmentRequired' in result).toBe(true);
      if (!('mfaEnrollmentRequired' in result)) throw new Error('expected enrollment required');
      expect(result.redirectTo).toBe('/auth/mfa/enroll');
    });

    it('visitor without MFA is unaffected (no warning, no block)', async () => {
      const user = makeUser({
        id: 200,
        email: 'visitor@musaium.test',
        role: 'visitor',
        password: passwordHash('VisitorPass1!'),
        email_verified: true,
      });
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      const result = await svc.login(user.email, 'VisitorPass1!');
      expect('accessToken' in result).toBe(true);
      if (!('accessToken' in result)) throw new Error('expected session');
      expect(result.mfaWarningDaysRemaining).toBeUndefined();
    });
  });

  // F6 (2026-04-30) — MFA enforcement extended from admin-only to ANY enrolled user.
  // Decision per ADR-013 (banking-grade): once a user opts into TOTP, every login
  // must complete the second factor regardless of role. Non-enrolled non-admins
  // remain unaffected (opt-in stays opt-in).
  describe('F6 — MFA enforced for all enrolled users', () => {
    /** Enrolls the user's TOTP fixture so the gate sees a `enrolledAt` row. */
    const enrollFixture = async (
      userRepo: ReturnType<typeof statefulUserRepo>,
      totpRepo: InMemoryTotpSecretRepository,
      userId: number,
    ): Promise<void> => {
      await new EnrollMfaUseCase(userRepo, totpRepo).execute(userId);
      const persisted = await totpRepo.findByUserId(userId);
      if (!persisted) throw new Error('enrollment fixture missing');
      const secret = decryptTotpSecret(persisted.secretEncrypted);
      const code = new OTPAuth.TOTP({
        issuer: 'Musaium',
        label: 'fixture',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      }).generate();
      await new VerifyMfaUseCase(userRepo, totpRepo).execute(userId, code);
    };

    it('visitor with TOTP enrollment must complete the second factor (was bypassed pre-F6)', async () => {
      const user = makeUser({
        id: 300,
        email: 'visitor-mfa@musaium.test',
        role: 'visitor',
        password: passwordHash('VisitorMfa1!'),
        email_verified: true,
      });
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      await enrollFixture(userRepo, totpRepo, user.id);

      const result = await svc.login(user.email, 'VisitorMfa1!');
      expect('mfaRequired' in result).toBe(true);
      if (!('mfaRequired' in result)) throw new Error('expected MFA challenge');
      expect(result.mfaSessionToken).toBeTruthy();
    });

    it('moderator with TOTP enrollment must complete the second factor', async () => {
      const user = makeUser({
        id: 301,
        email: 'mod-mfa@musaium.test',
        role: 'moderator',
        password: passwordHash('ModMfa1!'),
        email_verified: true,
      });
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      await enrollFixture(userRepo, totpRepo, user.id);

      const result = await svc.login(user.email, 'ModMfa1!');
      expect('mfaRequired' in result).toBe(true);
    });

    it('museum_manager with TOTP enrollment must complete the second factor', async () => {
      const user = makeUser({
        id: 302,
        email: 'mgr-mfa@musaium.test',
        role: 'museum_manager',
        password: passwordHash('MgrMfa1!'),
        email_verified: true,
      });
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      await enrollFixture(userRepo, totpRepo, user.id);

      const result = await svc.login(user.email, 'MgrMfa1!');
      expect('mfaRequired' in result).toBe(true);
    });

    it('visitor without TOTP enrollment STILL gets a session (no admin warning policy)', async () => {
      // Negative control: F6 must not regress the opt-in nature for non-admins.
      const user = makeUser({
        id: 303,
        email: 'visitor-noopt@musaium.test',
        role: 'visitor',
        password: passwordHash('VisitorNoOpt1!'),
        email_verified: true,
      });
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      const result = await svc.login(user.email, 'VisitorNoOpt1!');
      expect('accessToken' in result).toBe(true);
    });
  });

  describe('enrollment + verify clears deadline', () => {
    it('enroll → verify with valid 6-digit code clears deadline + sets enrolledAt', async () => {
      const user = adminUser({
        mfaEnrollmentDeadline: new Date(Date.now() + 10 * 86_400_000),
      });
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();

      const enroll = new EnrollMfaUseCase(userRepo, totpRepo);
      const enrollment = await enroll.execute(user.id);
      expect(enrollment.recoveryCodes).toHaveLength(10);
      expect(enrollment.otpauthUrl).toMatch(/^otpauth:\/\//);

      // Synthesize a real 6-digit code from the persisted (encrypted) secret.
      const persisted = await totpRepo.findByUserId(user.id);
      if (!persisted) throw new Error('row missing post-enrollment');
      const secret = decryptTotpSecret(persisted.secretEncrypted);
      const code = new OTPAuth.TOTP({
        issuer: 'Musaium',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      }).generate();

      const verify = new VerifyMfaUseCase(userRepo, totpRepo);
      const result = await verify.execute(user.id, code);
      expect(result.enrolledAt).toBeDefined();

      const after = await totpRepo.findByUserId(user.id);
      expect(after?.enrolledAt).toBeInstanceOf(Date);
      expect(user.mfaEnrollmentDeadline).toBeNull();
    });

    it('verify rejects an invalid code with 401', async () => {
      const user = adminUser();
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      await new EnrollMfaUseCase(userRepo, totpRepo).execute(user.id);

      const verify = new VerifyMfaUseCase(userRepo, totpRepo);
      await expect(verify.execute(user.id, '000000')).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_MFA_CODE',
      });
    });
  });

  describe('challenge flow (TOTP)', () => {
    it('login on enrolled admin returns mfaRequired + valid sessionToken; challenge issues JWTs', async () => {
      const user = adminUser();
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      // Pre-enroll the user so login takes the MFA branch.
      await new EnrollMfaUseCase(userRepo, totpRepo).execute(user.id);
      const persisted = await totpRepo.findByUserId(user.id);
      if (!persisted) throw new Error('missing TOTP row');
      const secret = decryptTotpSecret(persisted.secretEncrypted);
      // Mark the row enrolled by hand (verify already covered separately).
      await totpRepo.markEnrolled(user.id, new Date());

      const loginRes = await svc.login(user.email, 'Adm1nP@ss');
      expect('mfaRequired' in loginRes).toBe(true);
      if (!('mfaRequired' in loginRes)) throw new Error('expected mfaRequired');
      expect(loginRes.mfaSessionToken).toBeTruthy();
      expect(loginRes.mfaSessionExpiresIn).toBe(env.auth.mfaSessionTokenTtlSeconds);

      const code = new OTPAuth.TOTP({
        issuer: 'Musaium',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      }).generate();

      const challenge = new ChallengeMfaUseCase(userRepo, totpRepo, svc);
      const out = await challenge.execute({
        mfaSessionToken: loginRes.mfaSessionToken,
        code,
      });
      expect(out.session.accessToken).toBeTruthy();
      expect(out.session.refreshToken).toBeTruthy();
      expect(out.userId).toBe(user.id);
      expect(verifyTotpCode(secret, code)).toBe(true);
    });

    it('challenge with a wrong code throws INVALID_MFA_CODE', async () => {
      const user = adminUser();
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      await new EnrollMfaUseCase(userRepo, totpRepo).execute(user.id);
      await totpRepo.markEnrolled(user.id, new Date());

      const sessionToken = issueMfaSessionToken(user.id);
      const challenge = new ChallengeMfaUseCase(userRepo, totpRepo, svc);
      await expect(
        challenge.execute({ mfaSessionToken: sessionToken, code: '000000' }),
      ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_MFA_CODE' });
    });
  });

  describe('recovery code flow', () => {
    // Bcrypt @ cost 12 × 10 codes × 2 verifications dominates this test —
    // bumped to 60 s so the synthetic comparison cost cannot trip flakiness.
    it('first use of a recovery code issues JWTs; second use of same code rejects', async () => {
      const user = adminUser();
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      const refreshRepo = makeRefreshTokenRepo();
      const svc = new AuthSessionService(userRepo, refreshRepo, totpRepo);

      const enrollment = await new EnrollMfaUseCase(userRepo, totpRepo).execute(user.id);
      await totpRepo.markEnrolled(user.id, new Date());

      const sessionToken = issueMfaSessionToken(user.id);
      const recovery = new RecoveryMfaUseCase(userRepo, totpRepo, svc);

      const first = await recovery.execute({
        mfaSessionToken: sessionToken,
        recoveryCode: enrollment.recoveryCodes[0],
      });
      expect(first.session.accessToken).toBeTruthy();
      expect(first.remainingCodes).toBe(9);

      const sessionToken2 = issueMfaSessionToken(user.id);
      await expect(
        recovery.execute({
          mfaSessionToken: sessionToken2,
          recoveryCode: enrollment.recoveryCodes[0],
        }),
      ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_RECOVERY_CODE' });
    }, 60_000);
  });

  describe('disable flow', () => {
    it('rejects without a valid password reauth', async () => {
      const user = adminUser();
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();
      await new EnrollMfaUseCase(userRepo, totpRepo).execute(user.id);
      await totpRepo.markEnrolled(user.id, new Date());

      const disable = new DisableMfaUseCase(userRepo, totpRepo);
      await expect(disable.execute(user.id, 'wrong-password')).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });

      // Row still present.
      const row = await totpRepo.findByUserId(user.id);
      expect(row).not.toBeNull();
    });

    it('removes the secret on valid reauth (rotates secret on next enroll)', async () => {
      const user = adminUser();
      const userRepo = statefulUserRepo([user]);
      const totpRepo = new InMemoryTotpSecretRepository();

      const enrollA = await new EnrollMfaUseCase(userRepo, totpRepo).execute(user.id);
      await totpRepo.markEnrolled(user.id, new Date());

      const disable = new DisableMfaUseCase(userRepo, totpRepo);
      await disable.execute(user.id, 'Adm1nP@ss');
      expect(await totpRepo.findByUserId(user.id)).toBeNull();

      const enrollB = await new EnrollMfaUseCase(userRepo, totpRepo).execute(user.id);
      // Re-enrollment yields a brand-new secret (otpauth URLs differ).
      expect(enrollB.manualSecret).not.toBe(enrollA.manualSecret);
    });
  });
});
