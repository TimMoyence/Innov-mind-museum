/**
 * RED — T1.8 — R7 — one issued `mfaSessionToken` authorises AT MOST ONE
 * successful MFA step. After a token mints a session (challenge OR recovery),
 * re-presenting the SAME token — even with a fresh valid code — is rejected
 * `INVALID_MFA_SESSION` and issues NO second session.
 *
 * Spec  : team-state/2026-05-26-auth-mfa-rgpd-zerodefect/cycles/T/spec.md §R7.
 * Design: cycles/T/design.md §3 (D5 — inject `IAccessTokenDenylist` via setter)
 *         + §9 D2 (jti added to denylist after success; rejected if `has(jti)`).
 *
 * Anchored to LESSONS / source:
 *  - `lib-docs/jsonwebtoken/LESSONS.md` — no JWT-native single-use; reuse the
 *    jti denylist (the project's revocation store).
 *  - Source `challengeMfa.useCase.ts` / `recoveryMfa.useCase.ts` — 3-arg ctors,
 *    NO denylist param, NO `verifyMfaSessionToken().jti` read, NO `denylist.has`
 *    /`add`. So injecting a denylist + replaying the same token still mints a
 *    second session today → RED for the right reason. The `setAccessTokenDenylist`
 *    setter is the cycle-T addition (cast pins it).
 *
 * Each replay uses a NEW valid code (next TOTP step / a different recovery code)
 * so the T1/T2 code-CAS does NOT block — isolating the T3 token-single-use guard.
 *
 * Run scope:
 *   pnpm jest tests/unit/auth/mfaSession.single-use.test.ts
 */

import bcrypt from 'bcrypt';
import * as OTPAuth from 'otpauth';

import { ChallengeMfaUseCase } from '@modules/auth/useCase/totp/challengeMfa.useCase';
import { RecoveryMfaUseCase } from '@modules/auth/useCase/totp/recoveryMfa.useCase';
import { issueMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';
import { encryptTotpSecret } from '@modules/auth/useCase/totp/totpEncryption';
import { InMemoryAccessTokenDenylist } from '@modules/auth/adapters/secondary/redis/inmemory-access-token-denylist';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';
import { makeTotpSecret, InMemoryTotpSecretRepository } from '../../helpers/auth/mfa-fixtures';

import type { TotpRecoveryCode, TotpSecret } from '@modules/auth/domain/totp/totp-secret.entity';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type {
  AuthSessionResponse,
  AuthSessionService,
} from '@modules/auth/useCase/session/authSession.service';

process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const PERIOD_SECONDS = 30;
const PLAIN_SECRET_B32 = new OTPAuth.Secret({ size: 20 }).base32;

const buildTotp = (): OTPAuth.TOTP =>
  new OTPAuth.TOTP({
    issuer: 'Musaium',
    label: 'user@test',
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(PLAIN_SECRET_B32),
  });

const codeForStep = (totp: OTPAuth.TOTP, step: number): string =>
  totp.generate({ timestamp: step * PERIOD_SECONDS * 1000 });

const fakeSession = {
  accessToken: 'fake-access',
  refreshToken: 'fake-refresh',
} as unknown as AuthSessionResponse;

const makeAuthSvc = (): jest.Mocked<Pick<AuthSessionService, 'issueSessionForUser'>> =>
  ({
    issueSessionForUser: jest.fn(async () => fakeSession),
  }) as unknown as jest.Mocked<Pick<AuthSessionService, 'issueSessionForUser'>>;

/**
 * In-memory repo with the cycle-T `consumeRecoveryCode` CAS ADDED (an extra
 * method, not an override — no return-type clash with the base). `markUsed` is
 * inherited unchanged. The green recovery use-case will call `consumeRecoveryCode`;
 * at HEAD it calls the blind full-array path, so this method is dormant today —
 * the RED comes from the jti/denylist gap, not from this repo.
 */
class CasRepo extends InMemoryTotpSecretRepository {
  async consumeRecoveryCode(
    userId: number,
    index: number,
    at: Date,
  ): Promise<{ affected: number }> {
    const row = this.rows.get(userId);
    if (!row) return { affected: 0 };
    const entry = row.recoveryCodes[index];
    if (!entry || entry.consumedAt !== null) return { affected: 0 };
    row.recoveryCodes = row.recoveryCodes.map((c, i) =>
      i === index ? { ...c, consumedAt: at.toISOString() } : c,
    );
    return { affected: 1 };
  }
}

/**
 * Inject the denylist via the cycle-T setter (cast pins the future API). The
 * setter does NOT exist at HEAD — guarded so its absence does not crash setup
 * with a TypeError; the test then reaches the meaningful assertion (a second
 * session is minted) and fails THERE, the intended RED. Green adds the setter.
 */
const withDenylist = <T extends object>(uc: T, denylist: InMemoryAccessTokenDenylist): T => {
  const setter = (uc as { setAccessTokenDenylist?: (d: InMemoryAccessTokenDenylist) => void })
    .setAccessTokenDenylist;
  if (typeof setter === 'function') {
    setter.call(uc, denylist);
  }
  return uc;
};

describe('mfaSessionToken — single-use across challenge & recovery (R7)', () => {
  let realDateNow: typeof Date.now;
  const fixedTimeMs = 1_747_789_200_000;
  const currentStep = Math.floor(fixedTimeMs / 1000 / PERIOD_SECONDS);

  beforeEach(() => {
    realDateNow = Date.now;
    Date.now = (): number => fixedTimeMs;
  });
  afterEach(() => {
    Date.now = realDateNow;
  });

  it('challenge: replaying the same token (with a fresh code) is rejected INVALID_MFA_SESSION (R7)', async () => {
    const user = makeUser({ id: 81, role: 'admin' });
    const userRepo = makeUserRepo(user);
    const repo = new CasRepo();
    repo.rows.set(
      user.id,
      makeTotpSecret({
        userId: user.id,
        secretEncrypted: encryptTotpSecret(PLAIN_SECRET_B32),
        enrolledAt: new Date('2026-04-01T00:00:00Z'),
        lastUsedStep: String(currentStep - 1),
      } as Partial<TotpSecret>),
    );
    const authSvc = makeAuthSvc();
    const denylist = new InMemoryAccessTokenDenylist(() => fixedTimeMs);
    const useCase = withDenylist(
      new ChallengeMfaUseCase(
        userRepo,
        repo as unknown as ITotpSecretRepository,
        authSvc as unknown as AuthSessionService,
      ),
      denylist,
    );

    const token = issueMfaSessionToken(user.id);
    const totp = buildTotp();

    // First exchange — succeeds, jti now denylisted.
    await useCase.execute({ mfaSessionToken: token, code: codeForStep(totp, currentStep) });
    expect(authSvc.issueSessionForUser).toHaveBeenCalledTimes(1);

    // Replay the SAME token with a FRESH valid code (next step) → step-CAS would
    // pass; only the jti single-use guard can stop it.
    await expect(
      useCase.execute({ mfaSessionToken: token, code: codeForStep(totp, currentStep + 1) }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_MFA_SESSION' });
    // Fails today: no jti/denylist → a second session is minted.
    expect(authSvc.issueSessionForUser).toHaveBeenCalledTimes(1);
  });

  it('recovery: replaying the same token (with a fresh recovery code) is rejected INVALID_MFA_SESSION (R7)', async () => {
    const user = makeUser({ id: 82, role: 'admin' });
    const userRepo = makeUserRepo(user);
    const repo = new CasRepo();
    const codeA = 'TEST00-CODE00';
    const codeB = 'TEST01-CODE01';
    const codes: TotpRecoveryCode[] = [
      { hash: await bcrypt.hash(codeA, 4), consumedAt: null },
      { hash: await bcrypt.hash(codeB, 4), consumedAt: null },
    ];
    repo.rows.set(
      user.id,
      makeTotpSecret({
        userId: user.id,
        enrolledAt: new Date('2026-04-01T00:00:00Z'),
        recoveryCodes: codes,
      }),
    );
    const authSvc = makeAuthSvc();
    const denylist = new InMemoryAccessTokenDenylist(() => fixedTimeMs);
    const useCase = withDenylist(
      new RecoveryMfaUseCase(
        userRepo,
        repo as unknown as ITotpSecretRepository,
        authSvc as unknown as AuthSessionService,
      ),
      denylist,
    );

    const token = issueMfaSessionToken(user.id);

    await useCase.execute({ mfaSessionToken: token, recoveryCode: codeA });
    expect(authSvc.issueSessionForUser).toHaveBeenCalledTimes(1);

    // Replay SAME token with a DIFFERENT still-valid recovery code → recovery-CAS
    // would pass; only the jti single-use guard can stop it.
    await expect(
      useCase.execute({ mfaSessionToken: token, recoveryCode: codeB }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_MFA_SESSION' });
    expect(authSvc.issueSessionForUser).toHaveBeenCalledTimes(1);
  });
});
