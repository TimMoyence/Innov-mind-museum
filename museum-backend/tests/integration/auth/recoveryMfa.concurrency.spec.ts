/**
 * RED — T1.6 — R5/R6 — recovery-code consumption under CONCURRENCY MUST honour
 * a given recovery code AT MOST ONCE: N parallel submissions of the SAME code
 * → exactly 1 success, N-1 INVALID_RECOVERY_CODE, and exactly ONE entry stamped
 * `consumedAt != null`.
 *
 * Spec  : team-state/2026-05-26-auth-mfa-rgpd-zerodefect/cycles/T/spec.md §R5/R6.
 * Design: cycles/T/design.md §6 + D1 — atomic jsonb conditional UPDATE
 *         (`consumeRecoveryCode`); proven against REAL Postgres (the row
 *         write-lock serialises the two transactions; the JS-Map repo cannot).
 *
 * Anchored to LESSONS / source (typeorm PATTERNS.md absent — design OQ1):
 *  - `lib-docs/typeorm/LESSONS.md` 2026-05 verifyEmail replay — same read-modify
 *    -write TOCTOU. The fix is a single atomic CAS exposing `UpdateResult.affected`.
 *  - Source `recoveryMfa.useCase.ts:55-65` — `findRecoveryCodeIndex` then
 *    `markCodeConsumed` (pure JS array map) then a BLIND full-array
 *    `updateRecoveryCodes(userId, updated)` (`totp-secret.repository.pg.ts:65-67`,
 *    unconditional `repo.update({userId}, {recoveryCodes})`). Two concurrent
 *    callers both read the same array, both find the same null entry, both write
 *    the full array → last-writer-wins, BOTH mint a session (double-spend).
 *
 * Failure mode at HEAD (proves RED): `consumeRecoveryCode` does not exist (the
 * use-case uses the blind full-array replace), so 5 parallel submissions of the
 * SAME code → ≥2 successes (double-spend) where exactly 1 is allowed.
 *
 * Discipline: `Promise.all` + settle-then-classify, NEVER a sequential loop.
 * Distinct mfaSessionToken per attempt isolates the T2 recovery-CAS race.
 *
 * Run scope:
 *   RUN_INTEGRATION=true pnpm jest tests/integration/auth/recoveryMfa.concurrency.spec.ts --runInBand
 */

import bcrypt from 'bcrypt';

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { TotpRecoveryCode, TotpSecret } from '@modules/auth/domain/totp/totp-secret.entity';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type {
  AuthSessionResponse,
  AuthSessionService,
} from '@modules/auth/useCase/session/authSession.service';
import type { User } from '@modules/auth/domain/user/user.entity';

type EncryptTotp = (secret: string) => string;
type RepoCtor = new (dataSource: IntegrationHarness['dataSource']) => ITotpSecretRepository;
type RecoveryCtor = new (
  userRepository: IUserRepository,
  totpRepository: ITotpSecretRepository,
  authSessionService: AuthSessionService,
) => {
  execute: (input: { mfaSessionToken: string; recoveryCode: string }) => Promise<unknown>;
};
type IssueToken = (userId: number) => string;

let encryptTotpSecret: EncryptTotp;
let TotpSecretRepositoryPg: RepoCtor;
let RecoveryMfaUseCase: RecoveryCtor;
let issueMfaSessionToken: IssueToken;

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const makeUserRepoStub = (user: User): IUserRepository =>
  ({
    getUserById: async () => user,
  }) as unknown as IUserRepository;

const makeAuthSvcStub = (): { svc: AuthSessionService; issued: () => number } => {
  let count = 0;
  const svc = {
    issueSessionForUser: async (): Promise<AuthSessionResponse> => {
      count += 1;
      return { accessToken: 'a', refreshToken: 'r' } as unknown as AuthSessionResponse;
    },
  } as unknown as AuthSessionService;
  return { svc, issued: (): number => count };
};

describeIntegration('RecoveryMfaUseCase — concurrency: at-most-once consume (R5/R6)', () => {
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
    RecoveryMfaUseCase = (
      require('@modules/auth/useCase/totp/recoveryMfa.useCase') as {
        RecoveryMfaUseCase: RecoveryCtor;
      }
    ).RecoveryMfaUseCase;
    issueMfaSessionToken = (
      require('@modules/auth/useCase/totp/mfaSessionToken') as {
        issueMfaSessionToken: IssueToken;
      }
    ).issueMfaSessionToken;

    repo = new TotpSecretRepositoryPg(harness.dataSource);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const PLAIN_CODE = 'TEST00-CODE00';

  const seedWithRecoveryCodes = async (userId: number, email: string): Promise<void> => {
    const passwordHash = await bcrypt.hash('Test1234!', 4);
    await harness.dataSource.query(
      `INSERT INTO users (id, email, password, email_verified, role)
       VALUES ($1, $2, $3, true, 'admin')
       ON CONFLICT DO NOTHING`,
      [userId, email, passwordHash],
    );
    // 10 recovery codes, index 0 = PLAIN_CODE; all consumedAt null.
    const codes: TotpRecoveryCode[] = [];
    for (let i = 0; i < 10; i += 1) {
      const plain =
        i === 0
          ? PLAIN_CODE
          : `TEST${String(i).padStart(2, '0')}-CODE${String(i).padStart(2, '0')}`;
      codes.push({ hash: await bcrypt.hash(plain, 4), consumedAt: null });
    }
    await harness.dataSource.query(
      `INSERT INTO totp_secrets (user_id, secret_encrypted, recovery_codes, enrolled_at)
       VALUES ($1, $2, $3::jsonb, now())`,
      [userId, encryptTotpSecret('JBSWY3DPEHPK3PXP'), JSON.stringify(codes)],
    );
  };

  it('5 parallel identical recovery submissions → exactly 1 success, 4 INVALID_RECOVERY_CODE; one consumedAt (R5/R6)', async () => {
    const userId = 60_001;
    await seedWithRecoveryCodes(userId, 'r6@test.musaium');

    const user = { id: userId, role: 'admin' } as unknown as User;
    const { svc, issued } = makeAuthSvcStub();
    const useCase = new RecoveryMfaUseCase(makeUserRepoStub(user), repo, svc);

    const N = 5;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        useCase
          .execute({ mfaSessionToken: issueMfaSessionToken(userId), recoveryCode: PLAIN_CODE })
          .then(
            (res) => ({ ok: true as const, res }),
            (err: unknown) => ({ ok: false as const, err }),
          ),
      ),
    );

    const fulfilled = results.filter((r) => r.ok);
    const rejected = results.filter((r) => !r.ok);

    expect(fulfilled).toHaveLength(1); // fails today (last-writer-wins double-spend → ≥2)
    expect(rejected).toHaveLength(N - 1);
    expect(issued()).toBe(1);
    for (const r of rejected) {
      expect((r as { err: { code?: string } }).err).toMatchObject({
        code: 'INVALID_RECOVERY_CODE',
      });
    }

    const row = await repo.findByUserId(userId);
    const consumed = (row as TotpSecret).recoveryCodes.filter((c) => c.consumedAt !== null);
    expect(consumed).toHaveLength(1); // exactly ONE entry consumed
  });
});
