/**
 * RED — T1.5 — R4 (enrollment path) — `VerifyMfaUseCase` MUST reject a code
 * whose accepted step is `<= row.lastUsedStep` (RFC 6238 §5.2 replay
 * protection on enrollment-verify).
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R4.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.2 (verifyMfa
 *   mirror of challengeMfa).
 *
 * Anchored to PATTERNS / LESSONS :
 *  - RFC 6238 §5.2 — applies to verifier, not specific to challenge flow.
 *  - `lib-docs/otpauth/PATTERNS.md` §4 #8 — single-use even on first
 *    enrollment-verify (T2.10 design note : enrollment is single-use anyway,
 *    but seeding step protects post-enrollment first challenge).
 *
 * Failure mode at HEAD `00325d81` :
 *  - `verifyMfa.useCase.ts:41-50` calls `verifyTotpCode` (returns bool) →
 *    `markEnrolled` only ; no `markUsed(_, _, step)` ; no `lastUsedStep`
 *    comparison. The 3rd argument we assert on doesn't exist yet.
 *
 * Run scope :
 *   pnpm jest tests/unit/auth/verifyMfa.replay.test.ts
 */

import * as OTPAuth from 'otpauth';

import { encryptTotpSecret } from '@modules/auth/useCase/totp/totpEncryption';
import { VerifyMfaUseCase } from '@modules/auth/useCase/totp/verifyMfa.useCase';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';
import { makeTotpSecret, InMemoryTotpSecretRepository } from '../../helpers/auth/mfa-fixtures';

import type { TotpSecret } from '@modules/auth/domain/totp/totp-secret.entity';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';

process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const PERIOD_SECONDS = 30;
const ISSUER = 'Musaium';

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

type RowWithStep = TotpSecret & { lastUsedStep: string | null };

const makeRowWithStep = (overrides: Partial<RowWithStep>): RowWithStep =>
  makeTotpSecret({
    secretEncrypted: encryptTotpSecret(PLAIN_SECRET_B32),
    enrolledAt: null, // verifyMfa is the FIRST verification post-enroll
    ...overrides,
  } as Partial<TotpSecret>) as RowWithStep;

/**
 * Same step-aware spy wrapper as challengeMfa.replay.test — duplication is
 * intentional : each test file owns its in-memory contract. T2.10 GREEN will
 * change the production `ITotpSecretRepository.markUsed` signature to require
 * the step arg ; today's adapter compiles against the 2-arg shape.
 */
class StepAwareTotpRepo implements ITotpSecretRepository {
  inner: InMemoryTotpSecretRepository;
  markUsedSpy = jest.fn();
  markEnrolledSpy = jest.fn();

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
    this.markEnrolledSpy(userId, at);
    return await this.inner.markEnrolled(userId, at);
  }
  async markUsed(userId: number, at: Date, step?: number): Promise<void> {
    this.markUsedSpy(userId, at, step);
    if (step !== undefined) {
      const row = this.inner.rows.get(userId) as RowWithStep | undefined;
      if (row) row.lastUsedStep = String(step);
    }
    await this.inner.markUsed(userId, at);
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

describe('VerifyMfaUseCase — replay protection on enrollment verify (R4)', () => {
  let realDateNow: typeof Date.now;
  const fixedTimeMs = 1_747_789_200_000; // 2026-05-21T17:00:00Z UTC
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
    const totpRepo = new StepAwareTotpRepo(seedRow);
    const useCase = new VerifyMfaUseCase(userRepo, totpRepo);
    return { useCase, totpRepo, user };
  };

  it('rejects code valid for step N when lastUsedStep === N (R4.a — replay on enroll)', async () => {
    const seedStep = currentStep;
    const seed = makeRowWithStep({
      userId: 21,
      lastUsedStep: String(seedStep),
    });
    const { useCase, totpRepo } = buildCtx(seed);

    const totp = buildTotp(PLAIN_SECRET_B32);
    const code = codeForStep(totp, seedStep);

    await expect(useCase.execute(21, code)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_MFA_CODE',
    });
    expect(totpRepo.markUsedSpy).not.toHaveBeenCalled();
  });

  it('accepts code valid for step N+1 when lastUsedStep === N and persists step (R4.b)', async () => {
    const lastStep = currentStep - 1;
    const seed = makeRowWithStep({
      userId: 22,
      lastUsedStep: String(lastStep),
    });
    const { useCase, totpRepo } = buildCtx(seed);

    const totp = buildTotp(PLAIN_SECRET_B32);
    const code = codeForStep(totp, currentStep);

    const result = await useCase.execute(22, code);

    expect(result.enrolledAt).toBeTruthy();
    expect(totpRepo.markUsedSpy).toHaveBeenCalledTimes(1);
    expect(totpRepo.markUsedSpy).toHaveBeenCalledWith(22, expect.any(Date), currentStep);
  });

  it('rejects code valid for step N-1 when lastUsedStep === N (R4.c — window backward replay)', async () => {
    const lastStep = currentStep;
    const seed = makeRowWithStep({
      userId: 23,
      lastUsedStep: String(lastStep),
    });
    const { useCase, totpRepo } = buildCtx(seed);

    const totp = buildTotp(PLAIN_SECRET_B32);
    const code = codeForStep(totp, currentStep - 1);

    await expect(useCase.execute(23, code)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_MFA_CODE',
    });
    expect(totpRepo.markUsedSpy).not.toHaveBeenCalled();
  });

  it('accepts code valid for step N when lastUsedStep === null (R4.d — first verify post-deploy)', async () => {
    const seed = makeRowWithStep({
      userId: 24,
      lastUsedStep: null,
    });
    const { useCase, totpRepo } = buildCtx(seed);

    const totp = buildTotp(PLAIN_SECRET_B32);
    const code = codeForStep(totp, currentStep);

    const result = await useCase.execute(24, code);

    expect(result.enrolledAt).toBeTruthy();
    expect(totpRepo.markUsedSpy).toHaveBeenCalledTimes(1);
    expect(totpRepo.markUsedSpy).toHaveBeenCalledWith(24, expect.any(Date), currentStep);
    // markEnrolled still fires (existing behaviour preserved).
    expect(totpRepo.markEnrolledSpy).toHaveBeenCalledTimes(1);
  });
});
