/**
 * RED — T1.9 — R8 — disabling MFA MUST invalidate any in-flight
 * `mfaSessionToken`: a token minted BEFORE `disableMfa`, presented AFTER, yields
 * NO usable session on either the challenge or the recovery path.
 *
 * Spec  : team-state/2026-05-26-auth-mfa-rgpd-zerodefect/cycles/T/spec.md §R8.
 * Design: cycles/T/design.md §9 D4b — the row DELETION is the invalidation:
 *         after `deleteByUserId`, both challenge & recovery hit the
 *         `!row?.enrolledAt` guard → 401 `MFA_NOT_ENROLLED`, no session.
 *
 * Anchored to source:
 *  - `disableMfa.useCase.ts:17-20` — re-auth then `deleteByUserId`.
 *  - `challengeMfa.useCase.ts:45-52` / `recoveryMfa.useCase.ts:46-53` — the
 *    `!row?.enrolledAt` guard that the deletion triggers.
 *
 * Per design D4b this RED is the EXPLICIT regression LOCK of the
 * deletion-is-invalidation invariant. If a code path were to issue a session
 * post-delete, this fails (a real defect); otherwise it pins the invariant so a
 * future refactor cannot silently re-open the window.
 *
 * Run scope:
 *   pnpm jest tests/unit/auth/disableMfa.invalidation.test.ts
 */

import bcrypt from 'bcrypt';
import * as OTPAuth from 'otpauth';

import { ChallengeMfaUseCase } from '@modules/auth/useCase/totp/challengeMfa.useCase';
import { RecoveryMfaUseCase } from '@modules/auth/useCase/totp/recoveryMfa.useCase';
import { DisableMfaUseCase } from '@modules/auth/useCase/totp/disableMfa.useCase';
import { issueMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';
import { encryptTotpSecret } from '@modules/auth/useCase/totp/totpEncryption';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';
import { makeTotpSecret, InMemoryTotpSecretRepository } from '../../helpers/auth/mfa-fixtures';

import type { TotpRecoveryCode, TotpSecret } from '@modules/auth/domain/totp/totp-secret.entity';
import type {
  AuthSessionResponse,
  AuthSessionService,
} from '@modules/auth/useCase/session/authSession.service';

process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const PERIOD_SECONDS = 30;
const PLAIN_SECRET_B32 = new OTPAuth.Secret({ size: 20 }).base32;
const PASSWORD = 'Test1234!';

const buildTotp = (): OTPAuth.TOTP =>
  new OTPAuth.TOTP({
    issuer: 'Musaium',
    label: 'user@test',
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(PLAIN_SECRET_B32),
  });

const makeAuthSvc = (): jest.Mocked<Pick<AuthSessionService, 'issueSessionForUser'>> =>
  ({
    issueSessionForUser: jest.fn(
      async () => ({ accessToken: 'a', refreshToken: 'r' }) as unknown as AuthSessionResponse,
    ),
  }) as unknown as jest.Mocked<Pick<AuthSessionService, 'issueSessionForUser'>>;

describe('disableMfa — invalidates in-flight mfaSessionToken (R8)', () => {
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

  it('token minted before disable yields no session on challenge OR recovery after disable', async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const user = makeUser({ id: 90, role: 'admin', password: passwordHash });
    const userRepo = makeUserRepo(user);
    const repo = new InMemoryTotpSecretRepository();
    const recoveryPlain = 'TEST00-CODE00';
    const codes: TotpRecoveryCode[] = [
      { hash: await bcrypt.hash(recoveryPlain, 4), consumedAt: null },
    ];
    repo.rows.set(
      user.id,
      makeTotpSecret({
        userId: user.id,
        secretEncrypted: encryptTotpSecret(PLAIN_SECRET_B32),
        enrolledAt: new Date('2026-04-01T00:00:00Z'),
        recoveryCodes: codes,
        lastUsedStep: String(currentStep - 1),
      } as Partial<TotpSecret>),
    );

    const authSvc = makeAuthSvc();
    const challenge = new ChallengeMfaUseCase(
      userRepo,
      repo,
      authSvc as unknown as AuthSessionService,
    );
    const recovery = new RecoveryMfaUseCase(
      userRepo,
      repo,
      authSvc as unknown as AuthSessionService,
    );
    const disable = new DisableMfaUseCase(userRepo, repo);

    // Token minted while MFA is still active.
    const token = issueMfaSessionToken(user.id);

    // Admin disables MFA (re-auth with current password).
    await disable.execute(user.id, PASSWORD);

    // The pre-disable token must now be useless on BOTH paths.
    const totp = buildTotp();
    await expect(
      challenge.execute({
        mfaSessionToken: token,
        code: totp.generate({ timestamp: currentStep * PERIOD_SECONDS * 1000 }),
      }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'MFA_NOT_ENROLLED' });

    await expect(
      recovery.execute({ mfaSessionToken: token, recoveryCode: recoveryPlain }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'MFA_NOT_ENROLLED' });

    expect(authSvc.issueSessionForUser).not.toHaveBeenCalled();
  });
});
