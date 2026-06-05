/**
 * RED — T1.6 — R5/R6 — `RecoveryMfaUseCase` MUST gate session issuance on the
 * atomic `consumeRecoveryCode` CAS result:
 *  - match + `consumeRecoveryCode` → {affected:1}  ⇒ session, remaining count −1.
 *  - match + `consumeRecoveryCode` → {affected:0}  ⇒ INVALID_RECOVERY_CODE, NO session.
 *
 * Spec  : team-state/2026-05-26-auth-mfa-rgpd-zerodefect/cycles/T/spec.md §R5/R6.
 * Design: cycles/T/design.md §6 + D1 — replace the read-modify-write
 *         (`markCodeConsumed` + blind `updateRecoveryCodes`) with a single atomic
 *         `consumeRecoveryCode(userId, index)` CAS; gate on `affected === 1`.
 *
 * Anchored to LESSONS / source (typeorm PATTERNS.md absent — design OQ1):
 *  - `lib-docs/typeorm/LESSONS.md` 2026-05 verifyEmail replay — `affected` is the
 *    atomicity signal.
 *  - Source `recoveryMfa.useCase.ts:55-65` — today calls `updateRecoveryCodes`
 *    (full-array blind replace), NOT `consumeRecoveryCode`. So a `consumeRecoveryCode`
 *    stubbed to `{affected:0}` is never consulted → the use-case STILL issues a
 *    session → the R6 case fails for the right reason.
 *
 * Run scope:
 *   pnpm jest tests/unit/auth/recoveryMfa.test.ts
 */

import bcrypt from 'bcrypt';

import { RecoveryMfaUseCase } from '@modules/auth/useCase/totp/recoveryMfa.useCase';
import { issueMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';
import { makeTotpSecret, InMemoryTotpSecretRepository } from '../../helpers/auth/mfa-fixtures';

import type { TotpRecoveryCode, TotpSecret } from '@modules/auth/domain/totp/totp-secret.entity';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { User } from '@modules/auth/domain/user/user.entity';
import type {
  AuthSessionResponse,
  AuthSessionService,
} from '@modules/auth/useCase/session/authSession.service';

process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const fakeSession = {
  accessToken: 'fake-access',
  refreshToken: 'fake-refresh',
} as unknown as AuthSessionResponse;

const makeAuthSvc = (): jest.Mocked<Pick<AuthSessionService, 'issueSessionForUser'>> =>
  ({
    issueSessionForUser: jest.fn(async () => fakeSession),
  }) as unknown as jest.Mocked<Pick<AuthSessionService, 'issueSessionForUser'>>;

/**
 * In-memory repo extended with the cycle-T `consumeRecoveryCode` CAS method
 * (absent on the production port at HEAD — the cast pins the future contract).
 * `consumeOverride` forces the CAS result so the unit test pins the gate.
 */
class CasRecoveryRepo extends InMemoryTotpSecretRepository {
  consumeSpy = jest.fn();
  consumeOverride: { affected: number } = { affected: 1 };

  async consumeRecoveryCode(
    userId: number,
    index: number,
    at: Date,
  ): Promise<{ affected: number }> {
    this.consumeSpy(userId, index, at);
    if (this.consumeOverride.affected === 1) {
      const row = this.rows.get(userId);
      if (row) {
        row.recoveryCodes = row.recoveryCodes.map((c, i) =>
          i === index ? { ...c, consumedAt: at.toISOString() } : c,
        );
      }
    }
    return this.consumeOverride;
  }
}

const seedCodes = async (count: number): Promise<{ plain: string; codes: TotpRecoveryCode[] }> => {
  const plain = 'TEST00-CODE00';
  const codes: TotpRecoveryCode[] = [];
  for (let i = 0; i < count; i += 1) {
    const code =
      i === 0 ? plain : `TEST${String(i).padStart(2, '0')}-CODE${String(i).padStart(2, '0')}`;
    codes.push({ hash: await bcrypt.hash(code, 4), consumedAt: null });
  }
  return { plain, codes };
};

const buildCtx = async (): Promise<{
  useCase: RecoveryMfaUseCase;
  repo: CasRecoveryRepo;
  authSvc: jest.Mocked<Pick<AuthSessionService, 'issueSessionForUser'>>;
  token: string;
  plain: string;
  user: User;
}> => {
  const user = makeUser({ id: 70, role: 'admin' });
  const userRepo = makeUserRepo(user);
  const repo = new CasRecoveryRepo();
  const { plain, codes } = await seedCodes(10);
  const row = makeTotpSecret({
    userId: user.id,
    enrolledAt: new Date('2026-04-01T00:00:00Z'),
    recoveryCodes: codes,
  });
  repo.rows.set(user.id, row);
  const authSvc = makeAuthSvc();
  const useCase = new RecoveryMfaUseCase(
    userRepo,
    repo as unknown as ITotpSecretRepository,
    authSvc as unknown as AuthSessionService,
  );
  const token = issueMfaSessionToken(user.id);
  return { useCase, repo, authSvc, token, plain, user };
};

describe('RecoveryMfaUseCase — atomic consume gate (R5/R6)', () => {
  it('match + consumeRecoveryCode {affected:1} → session + remaining decremented (R5)', async () => {
    const { useCase, repo, authSvc, token, plain, user } = await buildCtx();
    repo.consumeOverride = { affected: 1 };

    const result = (await useCase.execute({ mfaSessionToken: token, recoveryCode: plain })) as {
      remainingCodes: number;
    };

    expect(authSvc.issueSessionForUser).toHaveBeenCalledTimes(1);
    expect(repo.consumeSpy).toHaveBeenCalledWith(user.id, 0, expect.any(Date)); // fails today: consumeRecoveryCode never called
    expect(result.remainingCodes).toBe(9);
    const row = (await repo.findByUserId(user.id)) as TotpSecret;
    expect(row.recoveryCodes.filter((c) => c.consumedAt !== null)).toHaveLength(1);
  });

  it('match + consumeRecoveryCode {affected:0} → INVALID_RECOVERY_CODE, NO session (R6 — lost race)', async () => {
    const { useCase, repo, authSvc, token, plain } = await buildCtx();
    repo.consumeOverride = { affected: 0 }; // concurrent winner already consumed it

    await expect(
      useCase.execute({ mfaSessionToken: token, recoveryCode: plain }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_RECOVERY_CODE',
    });
    // Fails today: the use-case ignores consumeRecoveryCode and issues a session anyway.
    expect(authSvc.issueSessionForUser).not.toHaveBeenCalled();
  });
});
