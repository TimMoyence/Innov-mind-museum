/**
 * RED — T1.4 — R3 — `ChallengeMfaUseCase` under CONCURRENCY MUST yield EXACTLY
 * ONE successful session when N parallel requests carry the SAME valid TOTP
 * code for the same user.
 *
 * Spec  : team-state/2026-05-26-auth-mfa-rgpd-zerodefect/cycles/T/spec.md §R3.
 * Design: cycles/T/design.md §6 (atomicity is a DB-level property — proven
 *         against REAL Postgres via the integration harness, NOT the in-memory
 *         JS-Map repo which cannot exercise a row write-lock).
 *
 * Anchored to LESSONS / source (PATTERNS.md absent for typeorm — see manifest
 * libDocsConsulted; design OQ1):
 *  - `lib-docs/typeorm/LESSONS.md` 2026-05 verifyEmail/resetToken replay — the
 *    SAME read-then-blind-UPDATE TOCTOU class we close here. CAS = conditional
 *    `createQueryBuilder().update().where(...).execute()` + `UpdateResult.affected`.
 *  - Source `totp-secret.repository.pg.ts:60-62` — today `markUsed` does an
 *    UNCONDITIONAL `repo.update({userId}, {...})` (no WHERE guard) → every
 *    concurrent caller writes → every caller proceeds to mint a session.
 *  - Source `challengeMfa.useCase.ts:68-77` — the only replay guard is a JS
 *    `lastStep` compare BEFORE the blind UPDATE (TOCTOU). N parallel requests
 *    all read the same `lastUsedStep`, all pass the JS compare, all UPDATE.
 *
 * Failure mode at HEAD (proves RED):
 *  - `markUsed` returns `void` (no `affected`), the use-case has no `affected`
 *    gate, the UPDATE is unconditional. `Promise.all` of 5 identical challenges
 *    → ALL 5 mint a session (5 successes), where the contract demands EXACTLY 1.
 *
 * Discipline:
 *  - Concurrency proven by `Promise.all` + settle-then-classify — NEVER a
 *    sequential `for await` loop (spec §4 zero-defect bar, automatic reject).
 *  - Distinct `mfaSessionToken` per attempt so this isolates the T1 step-CAS
 *    race, NOT the T3 token-single-use (tasks.md T1.4).
 *
 * Run scope:
 *   RUN_INTEGRATION=true pnpm jest tests/integration/auth/challengeMfa.concurrency.spec.ts --runInBand
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
import type {
  AuthSessionResponse,
  AuthSessionService,
} from '@modules/auth/useCase/session/authSession.service';
import type { User } from '@modules/auth/domain/user/user.entity';

// Type-only imports above are erased — safe at module top (no eager env read).
// Concrete bindings (repo, use-case, encryption, token issuer) are lazy-required
// inside `beforeAll` AFTER the harness pins PGDATABASE (env-cache race, see the
// markused.spec docblock for the same dodge).
type EncryptTotp = (secret: string) => string;
type RepoCtor = new (dataSource: IntegrationHarness['dataSource']) => ITotpSecretRepository;
type ChallengeCtor = new (
  userRepository: IUserRepository,
  totpRepository: ITotpSecretRepository,
  authSessionService: AuthSessionService,
) => { execute: (input: { mfaSessionToken: string; code: string }) => Promise<unknown> };
type IssueToken = (userId: number) => string;

let encryptTotpSecret: EncryptTotp;
let TotpSecretRepositoryPg: RepoCtor;
let ChallengeMfaUseCase: ChallengeCtor;
let issueMfaSessionToken: IssueToken;

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

/**
 * Minimal IUserRepository stub returning a fixed admin user for `getUserById`.
 * The concurrency proof exercises the totp repo + use-case gate, not user load.
 */
const makeUserRepoStub = (user: User): IUserRepository =>
  ({
    getUserById: async () => user,
  }) as unknown as IUserRepository;

/**
 * Read-barrier wrapper around the REAL PG repo. `findByUserId` blocks until ALL
 * `expectedReaders` reads have arrived, then releases them together — this
 * deterministically reproduces the production TOCTOU worst-case: every
 * concurrent request reads the SAME stale `lastUsedStep` BEFORE any `markUsed`
 * commits. Without the barrier, `--runInBand` + a fast synchronous TOTP verify
 * lets the first `markUsed` commit before later reads, so the JS step-guard
 * masks the race and the defect hides. The barrier does NOT add atomicity — it
 * only forces the overlap a multi-connection production pool produces under load.
 * `markUsed` (and everything else) still hits real Postgres, so the green CAS is
 * what makes EXACTLY ONE writer win.
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
    await this.gate; // every reader holds the stale row until all have read
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

/**
 * AuthSessionService stub: `issueSessionForUser` returns a sentinel session.
 * We count how many times it is called AND how many results carry a session —
 * a double-spend shows up as >1 issuance.
 */
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

describeIntegration('ChallengeMfaUseCase — concurrency: exactly one session (R3)', () => {
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
    ChallengeMfaUseCase = (
      require('@modules/auth/useCase/totp/challengeMfa.useCase') as {
        ChallengeMfaUseCase: ChallengeCtor;
      }
    ).ChallengeMfaUseCase;
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

  const seedEnrolledUser = async (
    userId: number,
    email: string,
    lastUsedStep: number,
  ): Promise<void> => {
    const passwordHash = await bcrypt.hash('Test1234!', 4);
    await harness.dataSource.query(
      `INSERT INTO users (id, email, password, email_verified, role)
       VALUES ($1, $2, $3, true, 'admin')
       ON CONFLICT DO NOTHING`,
      [userId, email, passwordHash],
    );
    // enrolled_at set (challenge requires enrollment), last_used_step one step
    // behind the code we will present so the JS compare passes for ALL callers.
    await harness.dataSource.query(
      `INSERT INTO totp_secrets (user_id, secret_encrypted, recovery_codes, enrolled_at, last_used_step)
       VALUES ($1, $2, '[]'::jsonb, now(), $3)`,
      [userId, encryptTotpSecret(PLAIN_SECRET_B32), String(lastUsedStep)],
    );
  };

  it('5 parallel identical-code challenges → exactly 1 session, 4 INVALID_MFA_CODE (R3)', async () => {
    const userId = 30_001;
    const fixedTimeMs = 1_747_789_200_000; // 2026-05-21T17:00:00Z UTC
    const currentStep = Math.floor(fixedTimeMs / 1000 / PERIOD_SECONDS);

    await seedEnrolledUser(userId, 'r3@test.musaium', currentStep - 1);

    const totp = buildTotp(PLAIN_SECRET_B32);
    const code = codeForStep(totp, currentStep);

    const realNow = Date.now;
    Date.now = (): number => fixedTimeMs;

    const user = { id: userId, role: 'admin' } as unknown as User;
    const userRepo = makeUserRepoStub(user);
    const { svc, issued } = makeAuthSvcStub();

    const N = 5;
    // Barrier forces all N reads to observe the SAME stale lastUsedStep before
    // any markUsed commits — the production TOCTOU worst-case.
    const barrierRepo = new ReadBarrierRepo(repo, N);
    const useCase = new ChallengeMfaUseCase(userRepo, barrierRepo, svc);

    try {
      // Distinct mfaSessionToken per attempt → isolates the T1 step-CAS race.
      const results = await Promise.all(
        Array.from({ length: N }, () =>
          useCase.execute({ mfaSessionToken: issueMfaSessionToken(userId), code }).then(
            (session) => ({ ok: true as const, session }),
            (err: unknown) => ({ ok: false as const, err }),
          ),
        ),
      );

      const fulfilled = results.filter((r) => r.ok);
      const rejected = results.filter((r) => !r.ok);

      expect(fulfilled).toHaveLength(1); // EXACTLY one winner — fails today (all 5 win)
      expect(rejected).toHaveLength(N - 1);
      expect(issued()).toBe(1); // exactly one JWT session minted
      for (const r of rejected) {
        expect((r as { err: { code?: string } }).err).toMatchObject({
          code: 'INVALID_MFA_CODE',
        });
      }

      // Post-state: the row's last_used_step advanced to currentStep exactly once.
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
