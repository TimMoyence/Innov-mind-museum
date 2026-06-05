/**
 * RED — T1.4 — R4 — `ChallengeMfaUseCase` MUST reject a TOTP code whose
 * accepted step is `<= row.lastUsedStep` (RFC 6238 §5.2 replay protection).
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R4.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.2 — read-before-accept.
 *
 * Anchored to PATTERNS / LESSONS :
 *  - RFC 6238 §5.2 "The verifier MUST NOT accept the second attempt of the OTP
 *    after the successful validation has been issued."
 *  - `lib-docs/otpauth/PATTERNS.md` §4 DON'T #8 "skip replay protection — a
 *    separate 'last delta seen' column on `totp_secrets` would be the textbook
 *    approach".
 *  - `lib-docs/otpauth/LESSONS.md` 2026-05-20 "Replay-protection (rappel
 *    doctrinal)" — `validate({window:1})` ALONE is not replay protection.
 *
 * Failure mode at HEAD `00325d81` :
 *  - `challengeMfa.useCase.ts:55-63` calls `verifyTotpCode` (returns bool today)
 *    and `markUsed(userId, new Date())` — no step persisted, no lastUsedStep
 *    comparison. Replays inside the ±30s window are silently accepted.
 *  - `TotpSecret` entity has no `lastUsedStep` field yet → TS won't compile
 *    against the new fixture shape we use here; the cast at `makeRow` pins the
 *    contract for green-phase.
 *
 * Run scope :
 *   pnpm jest tests/unit/auth/challengeMfa.replay.test.ts
 */

import * as OTPAuth from 'otpauth';

import { ChallengeMfaUseCase } from '@modules/auth/useCase/totp/challengeMfa.useCase';
import { issueMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';
import { encryptTotpSecret } from '@modules/auth/useCase/totp/totpEncryption';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeRefreshTokenRepo, makeUserRepo } from '../../helpers/auth/user-repo.mock';
import { makeTotpSecret, InMemoryTotpSecretRepository } from '../../helpers/auth/mfa-fixtures';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { TotpSecret } from '@modules/auth/domain/totp/totp-secret.entity';
import type { User } from '@modules/auth/domain/user/user.entity';
import type {
  AuthSessionResponse,
  AuthSessionService,
} from '@modules/auth/useCase/session/authSession.service';

process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const PERIOD_SECONDS = 30;
const ISSUER = 'Musaium';

// Test user with a stable TOTP secret. We encrypt the same plain base32 across
// every test so `decryptTotpSecret` in the use case reads back the SAME secret
// our helpers use to compute deterministic codes per step.
const PLAIN_SECRET_B32 = new OTPAuth.Secret({ size: 20 }).base32;

const buildTotp = (base32: string, label = 'user@test'): OTPAuth.TOTP =>
  new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(base32),
  });

const codeForStep = (totp: OTPAuth.TOTP, step: number): string =>
  totp.generate({ timestamp: step * PERIOD_SECONDS * 1000 });

interface FakeSession extends AuthSessionResponse {}

const fakeSession: FakeSession = {
  accessToken: 'fake-access',
  refreshToken: 'fake-refresh',
  user: {
    id: 1,
    email: 'user@test',
    firstname: null,
    lastname: null,
    role: 'visitor',
    museumId: null,
    onboardingCompleted: false,
  },
} as unknown as FakeSession;

/**
 * A typed extension that accepts the future field `lastUsedStep`. The PROD
 * entity at HEAD `00325d81` has no such column — TypeORM/jest still let us
 * stamp the field onto the in-memory object; the cast is the contract pin.
 */
type RowWithStep = TotpSecret & { lastUsedStep: string | null };

const makeRowWithStep = (overrides: Partial<RowWithStep>): RowWithStep =>
  makeTotpSecret({
    secretEncrypted: encryptTotpSecret(PLAIN_SECRET_B32),
    enrolledAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  } as Partial<TotpSecret>) as RowWithStep;

/** Minimal AuthSessionService stub satisfying ChallengeMfaUseCase's needs. */
const makeAuthSessionServiceStub = (user: User): AuthSessionService =>
  ({
    issueSessionForUser: jest.fn(async () => fakeSession),
    verifyAccessToken: jest.fn(() => ({ id: user.id, role: user.role, museumId: null })),
  }) as unknown as AuthSessionService;

/**
 * Spy-friendly wrapper around the in-memory repo that records markUsed calls
 * AND exposes the new (step) param. Today `markUsed(uid, at)` has 2 args; the
 * R5 signature adds `step`. Assertions below pin the new arg position.
 *
 * NOT declared `implements ITotpSecretRepository`: cycle T widens `markUsed` to
 * return `Promise<{affected}>`, which is structurally incompatible with the HEAD
 * port (`Promise<void>`) — so the wrapper is cast to the port via
 * `as unknown as ITotpSecretRepository` at the ctor call. The cast pins the
 * future contract WITHOUT a pure tsc error (the use-case ignores the return at
 * HEAD; the new R2 case fails behaviourally, not at compile time).
 */
class StepAwareTotpRepo {
  inner: InMemoryTotpSecretRepository;
  markUsedSpy = jest.fn();
  /**
   * Cycle T / R2: when set, `markUsed` returns this CAS result INSTEAD of
   * mutating the row — simulates the adapter losing the compare-and-set race
   * (`affected:0`). The use-case MUST gate `issueSessionForUser` on
   * `affected === 1`. Today it does NOT, so a forced `{affected:0}` still mints
   * a session → the new R2 case fails for the right reason.
   */
  casOverride: { affected: number } | null = null;

  constructor(seed: RowWithStep) {
    this.inner = new InMemoryTotpSecretRepository();
    this.inner.rows.set(seed.userId, seed);
  }

  async findByUserId(userId: number): Promise<TotpSecret | null> {
    return await this.inner.findByUserId(userId);
  }
  async upsertEnrollment(input: Parameters<ITotpSecretRepository['upsertEnrollment']>[0]) {
    return await this.inner.upsertEnrollment(input);
  }
  async markEnrolled(userId: number, at: Date): Promise<void> {
    return await this.inner.markEnrolled(userId, at);
  }
  /**
   * Cycle T / R1-R2: `markUsed` now returns the CAS result `{affected}`. Tests
   * call it with 3 args (incl. step). The `Promise<{affected:number}>` cast pins
   * the future contract — at HEAD the port returns `Promise<void>`.
   */
  async markUsed(userId: number, at: Date, step?: number): Promise<{ affected: number }> {
    this.markUsedSpy(userId, at, step);
    if (this.casOverride !== null) {
      return this.casOverride;
    }
    if (step !== undefined) {
      const row = this.inner.rows.get(userId) as RowWithStep | undefined;
      if (row) row.lastUsedStep = String(step);
    }
    await this.inner.markUsed(userId, at);
    return { affected: 1 };
  }
  async updateRecoveryCodes(
    userId: number,
    codes: Parameters<ITotpSecretRepository['updateRecoveryCodes']>[1],
  ) {
    return await this.inner.updateRecoveryCodes(userId, codes);
  }
  async deleteByUserId(userId: number): Promise<void> {
    return await this.inner.deleteByUserId(userId);
  }
}

describe('ChallengeMfaUseCase — replay protection (R4)', () => {
  let realDateNow: typeof Date.now;
  // 2026-05-21T17:00:00Z UTC → step 58_259_640 (spec.md §6 glossary).
  const fixedTimeMs = 1_747_789_200_000;
  const currentStep = Math.floor(fixedTimeMs / 1000 / PERIOD_SECONDS);

  beforeEach(() => {
    realDateNow = Date.now;
    Date.now = () => fixedTimeMs;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  const buildCtx = (seedRow: RowWithStep) => {
    const user = makeUser({ id: seedRow.userId, role: 'admin' });
    const userRepo = makeUserRepo(user);
    const refreshRepo = makeRefreshTokenRepo();
    const totpRepo = new StepAwareTotpRepo(seedRow);
    const authSvc = makeAuthSessionServiceStub(user);
    const useCase = new ChallengeMfaUseCase(
      userRepo,
      totpRepo as unknown as ITotpSecretRepository,
      authSvc,
    );
    const mfaSessionToken = issueMfaSessionToken(user.id);
    return { useCase, totpRepo, mfaSessionToken, user, authSvc, refreshRepo };
  };

  it('rejects INVALID_MFA_CODE and does NOT issue a session when markUsed CAS affects 0 rows (R2 — lost race)', async () => {
    // A code valid for currentStep, lastUsedStep one behind → JS compare PASSES.
    // The authoritative gate must be the CAS result: markUsed forced to
    // {affected:0} (a concurrent request already consumed this step) → the
    // use-case MUST throw INVALID_MFA_CODE BEFORE issueSessionForUser.
    const seed = makeRowWithStep({
      userId: 15,
      lastUsedStep: String(currentStep - 1),
    });
    const { useCase, mfaSessionToken, totpRepo, authSvc } = buildCtx(seed);
    totpRepo.casOverride = { affected: 0 }; // adapter lost the compare-and-set

    const totp = buildTotp(PLAIN_SECRET_B32);
    const code = codeForStep(totp, currentStep);

    await expect(useCase.execute({ mfaSessionToken, code })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_MFA_CODE',
    });
    // Fails today: no `affected` gate → session issued despite affected:0.
    expect(authSvc.issueSessionForUser).not.toHaveBeenCalled();
  });

  it('rejects code valid for step N when lastUsedStep === N (R4.a — exact replay)', async () => {
    const seedStep = currentStep;
    const seed = makeRowWithStep({
      userId: 11,
      lastUsedStep: String(seedStep),
    });
    const { useCase, mfaSessionToken, totpRepo } = buildCtx(seed);

    const totp = buildTotp(PLAIN_SECRET_B32);
    const code = codeForStep(totp, seedStep); // same step as lastUsedStep

    await expect(useCase.execute({ mfaSessionToken, code })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_MFA_CODE',
    });
    expect(totpRepo.markUsedSpy).not.toHaveBeenCalled();
  });

  it('accepts code valid for step N+1 when lastUsedStep === N and persists the new step (R4.b)', async () => {
    const lastStep = currentStep - 1; // user already used the previous step
    const seed = makeRowWithStep({
      userId: 12,
      lastUsedStep: String(lastStep),
    });
    const { useCase, mfaSessionToken, totpRepo } = buildCtx(seed);

    const totp = buildTotp(PLAIN_SECRET_B32);
    const code = codeForStep(totp, currentStep);

    const result = await useCase.execute({ mfaSessionToken, code });

    expect(result.userId).toBe(12);
    expect(totpRepo.markUsedSpy).toHaveBeenCalledTimes(1);
    expect(totpRepo.markUsedSpy).toHaveBeenCalledWith(12, expect.any(Date), currentStep);
  });

  it('rejects code valid for step N-1 (window=1 backward) when lastUsedStep === N (R4.c — past replay)', async () => {
    const lastStep = currentStep;
    const seed = makeRowWithStep({
      userId: 13,
      lastUsedStep: String(lastStep),
    });
    const { useCase, mfaSessionToken, totpRepo } = buildCtx(seed);

    const totp = buildTotp(PLAIN_SECRET_B32);
    // Code valid for the step BEFORE the last-used one — already-consumed
    // window MUST NOT re-open.
    const code = codeForStep(totp, currentStep - 1);

    await expect(useCase.execute({ mfaSessionToken, code })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_MFA_CODE',
    });
    expect(totpRepo.markUsedSpy).not.toHaveBeenCalled();
  });

  it('accepts code valid for step N when lastUsedStep === null (R4.d — first use post-deploy, R6 zero-downtime)', async () => {
    const seed = makeRowWithStep({
      userId: 14,
      lastUsedStep: null, // NULL = never used since the migration landed
    });
    const { useCase, mfaSessionToken, totpRepo } = buildCtx(seed);

    const totp = buildTotp(PLAIN_SECRET_B32);
    const code = codeForStep(totp, currentStep);

    const result = await useCase.execute({ mfaSessionToken, code });

    expect(result.userId).toBe(14);
    expect(totpRepo.markUsedSpy).toHaveBeenCalledTimes(1);
    expect(totpRepo.markUsedSpy).toHaveBeenCalledWith(14, expect.any(Date), currentStep);
  });
});
