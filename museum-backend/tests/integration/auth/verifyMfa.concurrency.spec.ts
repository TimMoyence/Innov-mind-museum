/**
 * RED — T1.5 — R4 — `VerifyMfaUseCase` (enrollment-verify path) under
 * CONCURRENCY MUST yield EXACTLY ONE success when N parallel requests carry the
 * SAME valid enrollment code for a never-used enrolled row.
 *
 * Spec  : team-state/2026-05-26-auth-mfa-rgpd-zerodefect/cycles/T/spec.md §R4.
 * Design: cycles/T/design.md §6 — same DB-level CAS atomicity as challenge,
 *         proven against REAL Postgres (in-memory JS-Map cannot exercise the
 *         row write-lock).
 *
 * Anchored to LESSONS / source (typeorm PATTERNS.md absent — design OQ1):
 *  - `lib-docs/typeorm/LESSONS.md` 2026-05 verifyEmail replay — same TOCTOU.
 *  - Source `verifyMfa.useCase.ts:55-66` — JS `lastStep` compare then blind
 *    `markUsed(userId, now, result.step)` (no `affected` gate). The enrollment
 *    code can be replayed against the first post-enrollment challenge inside the
 *    ±30 s window because the consume is not atomic.
 *  - Source `totp-secret.repository.pg.ts:60-62` — unconditional UPDATE.
 *
 * Failure mode at HEAD (proves RED):
 *  - No `affected` gate on the verify path → `Promise.all` of 5 identical verify
 *    calls all stamp `markEnrolled` + `markUsed` → 5 successes where exactly 1
 *    is allowed.
 *
 * Discipline: `Promise.all` + settle-then-classify, NEVER a sequential loop.
 *
 * Run scope:
 *   RUN_INTEGRATION=true pnpm jest tests/integration/auth/verifyMfa.concurrency.spec.ts --runInBand
 */

import bcrypt from 'bcrypt';
import * as OTPAuth from 'otpauth';

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { TotpSecret } from '@modules/auth/domain/totp/totp-secret.entity';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

type EncryptTotp = (secret: string) => string;
type RepoCtor = new (dataSource: IntegrationHarness['dataSource']) => ITotpSecretRepository;
type VerifyCtor = new (
  userRepository: IUserRepository,
  totpRepository: ITotpSecretRepository,
) => { execute: (userId: number, code: string) => Promise<unknown> };

let encryptTotpSecret: EncryptTotp;
let TotpSecretRepositoryPg: RepoCtor;
let VerifyMfaUseCase: VerifyCtor;

const PERIOD_SECONDS = 30;
const ISSUER = 'Musaium';
const PLAIN_SECRET_B32 = new OTPAuth.Secret({ size: 20 }).base32;

const buildTotp = (base32: string): OTPAuth.TOTP =>
  new OTPAuth.TOTP({
    issuer: ISSUER,
    label: 'user@test',
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(base32),
  });

const codeForStep = (totp: OTPAuth.TOTP, step: number): string =>
  totp.generate({ timestamp: step * PERIOD_SECONDS * 1000 });

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

/** Stub IUserRepository — verify path only needs `setMfaEnrollmentDeadline`. */
const makeUserRepoStub = (): IUserRepository =>
  ({
    setMfaEnrollmentDeadline: async () => undefined,
  }) as unknown as IUserRepository;

/**
 * Read-barrier wrapper around the REAL PG repo — see the identical helper in
 * `challengeMfa.concurrency.spec.ts` for the rationale. `findByUserId` blocks
 * until ALL `expectedReaders` reads have arrived, reproducing the production
 * TOCTOU worst-case (every concurrent verify reads the same stale row before
 * any markUsed commits). It adds NO atomicity — the green CAS is what makes
 * exactly one writer win. `markUsed`/`markEnrolled` still hit real Postgres.
 */
class ReadBarrierRepo implements ITotpSecretRepository {
  private arrived = 0;
  private releaseAll: (() => void) | null = null;
  private readonly gate: Promise<void>;

  constructor(
    private readonly inner: ITotpSecretRepository,
    private readonly expectedReaders: number,
  ) {
    this.gate = new Promise<void>((resolve) => {
      this.releaseAll = resolve;
    });
  }

  async findByUserId(userId: number): ReturnType<ITotpSecretRepository['findByUserId']> {
    const row = await this.inner.findByUserId(userId);
    this.arrived += 1;
    if (this.arrived >= this.expectedReaders) {
      this.releaseAll?.();
    }
    await this.gate;
    return row;
  }
  markUsed(...args: Parameters<ITotpSecretRepository['markUsed']>) {
    return this.inner.markUsed(...args);
  }
  markEnrolled(...args: Parameters<ITotpSecretRepository['markEnrolled']>) {
    return this.inner.markEnrolled(...args);
  }
  upsertEnrollment(...args: Parameters<ITotpSecretRepository['upsertEnrollment']>) {
    return this.inner.upsertEnrollment(...args);
  }
  updateRecoveryCodes(...args: Parameters<ITotpSecretRepository['updateRecoveryCodes']>) {
    return this.inner.updateRecoveryCodes(...args);
  }
  consumeRecoveryCode(...args: Parameters<ITotpSecretRepository['consumeRecoveryCode']>) {
    return this.inner.consumeRecoveryCode(...args);
  }
  deleteByUserId(...args: Parameters<ITotpSecretRepository['deleteByUserId']>) {
    return this.inner.deleteByUserId(...args);
  }
}

describeIntegration('VerifyMfaUseCase — concurrency: exactly one success (R4)', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;
  let repo: ITotpSecretRepository;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();

    encryptTotpSecret = (
      require('@modules/auth/useCase/totp/totpEncryption') as { encryptTotpSecret: EncryptTotp }
    ).encryptTotpSecret;
    TotpSecretRepositoryPg = (
      require('@modules/auth/adapters/secondary/pg/totp-secret.repository.pg') as {
        TotpSecretRepositoryPg: RepoCtor;
      }
    ).TotpSecretRepositoryPg;
    VerifyMfaUseCase = (
      require('@modules/auth/useCase/totp/verifyMfa.useCase') as { VerifyMfaUseCase: VerifyCtor }
    ).VerifyMfaUseCase;

    repo = new TotpSecretRepositoryPg(harness.dataSource);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const seedPendingEnrollment = async (userId: number, email: string): Promise<void> => {
    const passwordHash = await bcrypt.hash('Test1234!', 4);
    await harness.dataSource.query(
      `INSERT INTO users (id, email, password, email_verified, role)
       VALUES ($1, $2, $3, true, 'admin')
       ON CONFLICT DO NOTHING`,
      [userId, email, passwordHash],
    );
    // enrolled_at NULL (pending verify), last_used_step NULL (never used).
    await harness.dataSource.query(
      `INSERT INTO totp_secrets (user_id, secret_encrypted, recovery_codes, enrolled_at, last_used_step)
       VALUES ($1, $2, '[]'::jsonb, NULL, NULL)`,
      [userId, encryptTotpSecret(PLAIN_SECRET_B32)],
    );
  };

  it('5 parallel identical enrollment-verify → exactly 1 success, 4 INVALID_MFA_CODE (R4)', async () => {
    const userId = 40_001;
    const fixedTimeMs = 1_747_789_200_000;
    const currentStep = Math.floor(fixedTimeMs / 1000 / PERIOD_SECONDS);

    await seedPendingEnrollment(userId, 'r4@test.musaium');

    const totp = buildTotp(PLAIN_SECRET_B32);
    const code = codeForStep(totp, currentStep);

    const realNow = Date.now;
    Date.now = (): number => fixedTimeMs;

    const N = 5;
    // Barrier forces all N reads to observe the same never-used row before any
    // markUsed commits — the production TOCTOU worst-case.
    const barrierRepo = new ReadBarrierRepo(repo, N);
    const useCase = new VerifyMfaUseCase(makeUserRepoStub(), barrierRepo);

    try {
      const results = await Promise.all(
        Array.from({ length: N }, () =>
          useCase.execute(userId, code).then(
            (res) => ({ ok: true as const, res }),
            (err: unknown) => ({ ok: false as const, err }),
          ),
        ),
      );

      const fulfilled = results.filter((r) => r.ok);
      const rejected = results.filter((r) => !r.ok);

      expect(fulfilled).toHaveLength(1); // fails today (all 5 stamp markUsed)
      expect(rejected).toHaveLength(N - 1);
      for (const r of rejected) {
        expect((r as { err: { code?: string } }).err).toMatchObject({
          code: 'INVALID_MFA_CODE',
        });
      }

      const row = (await repo.findByUserId(userId)) as
        | (TotpSecret & {
            lastUsedStep: string | null;
          })
        | null;
      expect(row?.lastUsedStep).toBe(String(currentStep));
    } finally {
      Date.now = realNow;
    }
  });
});
