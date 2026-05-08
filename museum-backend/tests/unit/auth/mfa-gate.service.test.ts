import { MfaGateService } from '@modules/auth/useCase/session/mfa-gate.service';
import { verifyMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';
import { env } from '@src/config/env';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { InMemoryTotpSecretRepository, makeTotpSecret } from '../../helpers/auth/mfa-fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

/**
 * Narrow the discriminated union returned by `evaluateMfaGate` to the
 * `mfaRequired` envelope. Throws if the runtime shape disagrees so we never
 * silently false-positive an `expect` against a `null` or enrollment branch.
 * @param result
 */
const assertMfaRequired = (
  result: unknown,
): { mfaRequired: true; mfaSessionToken: string; mfaSessionExpiresIn: number } => {
  if (typeof result !== 'object' || result === null || !('mfaRequired' in result)) {
    throw new Error('expected MfaRequiredResponse envelope');
  }
  return result as { mfaRequired: true; mfaSessionToken: string; mfaSessionExpiresIn: number };
};

/**
 * Narrow the discriminated union to the `mfaEnrollmentRequired` envelope.
 * @param result
 */
const assertMfaEnrollmentRequired = (
  result: unknown,
): { mfaEnrollmentRequired: true; redirectTo: string } => {
  if (typeof result !== 'object' || result === null || !('mfaEnrollmentRequired' in result)) {
    throw new Error('expected MfaEnrollmentRequiredResponse envelope');
  }
  return result as { mfaEnrollmentRequired: true; redirectTo: string };
};

describe('MfaGateService', () => {
  let userRepo: jest.Mocked<IUserRepository>;
  let totpRepo: InMemoryTotpSecretRepository;
  let service: MfaGateService;

  beforeEach(() => {
    userRepo = makeUserRepo();
    totpRepo = new InMemoryTotpSecretRepository();
    service = new MfaGateService(userRepo, totpRepo);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('evaluateMfaGate — enrolled users (any role)', () => {
    it('returns mfaRequired envelope when an admin has an enrolled TOTP row', async () => {
      const user = makeUser({ id: 7, role: 'admin' });
      totpRepo.rows.set(7, makeTotpSecret({ id: 1, userId: 7, enrolledAt: new Date() }));

      const result = await service.evaluateMfaGate(user);

      const envelope = assertMfaRequired(result);
      expect(envelope.mfaRequired).toBe(true);
      expect(envelope.mfaSessionExpiresIn).toBe(env.auth.mfaSessionTokenTtlSeconds);
      expect(typeof envelope.mfaSessionToken).toBe('string');
      expect(envelope.mfaSessionToken.length).toBeGreaterThan(0);
    });

    it('gates on MFA for non-admin roles whenever they are enrolled (F6)', async () => {
      const user = makeUser({ id: 9, role: 'visitor' });
      totpRepo.rows.set(9, makeTotpSecret({ id: 1, userId: 9, enrolledAt: new Date() }));

      const result = await service.evaluateMfaGate(user);

      assertMfaRequired(result);
      // Visitors must NEVER have a deadline written even if they enrolled MFA.
      expect(userRepo.setMfaEnrollmentDeadline).not.toHaveBeenCalled();
    });

    it('issues an mfaSessionToken that round-trips back to the user id', async () => {
      const user = makeUser({ id: 1234, role: 'admin' });
      totpRepo.rows.set(1234, makeTotpSecret({ id: 1, userId: 1234, enrolledAt: new Date() }));

      const result = await service.evaluateMfaGate(user);

      const envelope = assertMfaRequired(result);
      const decoded = verifyMfaSessionToken(envelope.mfaSessionToken);
      expect(decoded.userId).toBe(1234);
    });

    it('treats a row without enrolledAt as not-enrolled (admin → enrollment policy applies)', async () => {
      const user = makeUser({ id: 11, role: 'admin', mfaEnrollmentDeadline: null });
      totpRepo.rows.set(11, makeTotpSecret({ id: 1, userId: 11, enrolledAt: null }));

      const result = await service.evaluateMfaGate(user);

      // Should NOT be MfaRequired — instead anchors deadline + happy path.
      expect(result).toBeNull();
      expect(userRepo.setMfaEnrollmentDeadline).toHaveBeenCalledTimes(1);
    });
  });

  describe('evaluateMfaGate — non-admin, non-enrolled', () => {
    it('returns null for a visitor with no TOTP row', async () => {
      const user = makeUser({ id: 1, role: 'visitor' });

      const result = await service.evaluateMfaGate(user);

      expect(result).toBeNull();
      expect(userRepo.setMfaEnrollmentDeadline).not.toHaveBeenCalled();
    });

    it('returns null for a moderator with no TOTP row (no warning, no soft-block)', async () => {
      const user = makeUser({ id: 2, role: 'moderator' });

      const result = await service.evaluateMfaGate(user);

      expect(result).toBeNull();
      expect(userRepo.setMfaEnrollmentDeadline).not.toHaveBeenCalled();
    });

    it('returns null for a museum_manager with no TOTP row', async () => {
      const user = makeUser({ id: 3, role: 'museum_manager' });

      const result = await service.evaluateMfaGate(user);

      expect(result).toBeNull();
    });
  });

  describe('evaluateMfaGate — admin enrollment-deadline policy (R16)', () => {
    it('anchors a fresh deadline on first admin login post-deploy', async () => {
      jest.useFakeTimers();
      const now = new Date('2026-05-01T00:00:00Z');
      jest.setSystemTime(now);

      const user = makeUser({ id: 50, role: 'admin', mfaEnrollmentDeadline: null });

      const result = await service.evaluateMfaGate(user);

      expect(result).toBeNull();
      expect(userRepo.setMfaEnrollmentDeadline).toHaveBeenCalledTimes(1);
      const [, deadline] = userRepo.setMfaEnrollmentDeadline.mock.calls[0] as [number, Date];
      const expectedMs = now.getTime() + env.auth.mfaEnrollmentWarningDays * 24 * 60 * 60 * 1000;
      expect(deadline.getTime()).toBe(expectedMs);
      // Mutates the in-memory user copy so callers can compute warning days.
      expect(user.mfaEnrollmentDeadline).toEqual(deadline);
    });

    it('does NOT re-anchor the deadline when one already exists', async () => {
      const existingDeadline = new Date('2026-12-31T00:00:00Z');
      const user = makeUser({
        id: 51,
        role: 'admin',
        mfaEnrollmentDeadline: existingDeadline,
      });

      const result = await service.evaluateMfaGate(user);

      expect(result).toBeNull();
      expect(userRepo.setMfaEnrollmentDeadline).not.toHaveBeenCalled();
      expect(user.mfaEnrollmentDeadline).toBe(existingDeadline);
    });

    it('returns null while the admin is still inside the warning window', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-01T00:00:00Z'));

      const user = makeUser({
        id: 52,
        role: 'admin',
        mfaEnrollmentDeadline: new Date('2026-05-15T00:00:00Z'),
      });

      const result = await service.evaluateMfaGate(user);

      expect(result).toBeNull();
    });

    it('returns mfaEnrollmentRequired exactly at the deadline boundary', async () => {
      jest.useFakeTimers();
      const deadline = new Date('2026-05-01T00:00:00Z');
      jest.setSystemTime(deadline);

      const user = makeUser({
        id: 53,
        role: 'admin',
        mfaEnrollmentDeadline: deadline,
      });

      const result = await service.evaluateMfaGate(user);

      const envelope = assertMfaEnrollmentRequired(result);
      expect(envelope.mfaEnrollmentRequired).toBe(true);
      expect(envelope.redirectTo).toBe('/auth/mfa/enroll');
    });

    it('returns mfaEnrollmentRequired once the deadline is past', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01T00:00:00Z'));

      const user = makeUser({
        id: 54,
        role: 'admin',
        mfaEnrollmentDeadline: new Date('2026-05-01T00:00:00Z'),
      });

      const result = await service.evaluateMfaGate(user);

      assertMfaEnrollmentRequired(result);
    });

    it('an enrolled admin past the deadline still receives mfaRequired, not enrollment-required', async () => {
      // Enrollment branch wins over the deadline branch.
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01T00:00:00Z'));

      const user = makeUser({
        id: 55,
        role: 'admin',
        mfaEnrollmentDeadline: new Date('2026-05-01T00:00:00Z'),
      });
      totpRepo.rows.set(55, makeTotpSecret({ id: 1, userId: 55, enrolledAt: new Date() }));

      const result = await service.evaluateMfaGate(user);

      assertMfaRequired(result);
    });
  });

  describe('evaluateMfaGate — degraded mode (no totp repository)', () => {
    it('treats every user as not-enrolled when totpRepository is omitted', async () => {
      const degradedService = new MfaGateService(userRepo);
      const user = makeUser({ id: 99, role: 'visitor' });

      const result = await degradedService.evaluateMfaGate(user);

      expect(result).toBeNull();
    });

    it('still applies the admin enrollment-deadline policy without a totpRepository', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01T00:00:00Z'));

      const degradedService = new MfaGateService(userRepo);
      const user = makeUser({
        id: 100,
        role: 'admin',
        mfaEnrollmentDeadline: new Date('2026-05-01T00:00:00Z'),
      });

      const result = await degradedService.evaluateMfaGate(user);

      assertMfaEnrollmentRequired(result);
    });
  });

  describe('computeWarningDays', () => {
    it('returns undefined for non-admin roles', () => {
      const visitor = makeUser({ role: 'visitor', mfaEnrollmentDeadline: new Date() });
      const moderator = makeUser({ role: 'moderator', mfaEnrollmentDeadline: new Date() });
      const manager = makeUser({ role: 'museum_manager', mfaEnrollmentDeadline: new Date() });

      expect(service.computeWarningDays(visitor)).toBeUndefined();
      expect(service.computeWarningDays(moderator)).toBeUndefined();
      expect(service.computeWarningDays(manager)).toBeUndefined();
    });

    it('returns undefined for an admin without a deadline', () => {
      const admin = makeUser({ role: 'admin', mfaEnrollmentDeadline: null });

      expect(service.computeWarningDays(admin)).toBeUndefined();
    });

    it('returns 0 when the admin deadline has already passed', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01T00:00:00Z'));

      const admin = makeUser({
        role: 'admin',
        mfaEnrollmentDeadline: new Date('2026-05-01T00:00:00Z'),
      });

      expect(service.computeWarningDays(admin)).toBe(0);
    });

    it('returns 0 exactly at the deadline boundary', () => {
      jest.useFakeTimers();
      const deadline = new Date('2026-05-01T00:00:00Z');
      jest.setSystemTime(deadline);

      const admin = makeUser({ role: 'admin', mfaEnrollmentDeadline: deadline });

      expect(service.computeWarningDays(admin)).toBe(0);
    });

    it('rounds up partial days so the banner never reads "0" while time remains', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-01T00:00:00Z'));

      // 30 minutes from deadline → ceil(0.0208…) = 1 day.
      const admin = makeUser({
        role: 'admin',
        mfaEnrollmentDeadline: new Date('2026-05-01T00:30:00Z'),
      });

      expect(service.computeWarningDays(admin)).toBe(1);
    });

    it('returns the exact integer days remaining when the gap is a whole-day multiple', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-01T00:00:00Z'));

      const admin = makeUser({
        role: 'admin',
        mfaEnrollmentDeadline: new Date('2026-05-08T00:00:00Z'),
      });

      expect(service.computeWarningDays(admin)).toBe(7);
    });
  });
});
