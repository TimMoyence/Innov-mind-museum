/**
 * RED — T1.2 — R5 — `TotpSecretRepositoryPg.consumeRecoveryCode(userId, index, at)`
 * MUST be an atomic compare-and-set on a single jsonb recovery entry:
 *  - on a `consumedAt:null` entry → `{affected:1}`, that entry's `consumedAt` set,
 *    siblings untouched;
 *  - on an already-consumed index → `{affected:0}`, no mutation;
 *  - out-of-range index → `{affected:0}`.
 *
 * Spec  : team-state/2026-05-26-auth-mfa-rgpd-zerodefect/cycles/T/spec.md §R5.
 * Design: cycles/T/design.md §4 + D1 — jsonb conditional UPDATE
 *         (`jsonb_set` guarded `WHERE (recovery_codes -> :idx ->> 'consumedAt') IS NULL`)
 *         returning `UpdateResult.affected`. No migration (existing column).
 *
 * Anchored to LESSONS / source (typeorm PATTERNS.md absent — design OQ1):
 *  - `lib-docs/typeorm/LESSONS.md` 2026-05 verifyEmail replay — `UpdateResult.affected`
 *    is the atomicity signal; blind full-array `repo.update` is the bug.
 *  - Source `totp-secret.repository.pg.ts` — `consumeRecoveryCode` does NOT exist;
 *    the only recovery write is `updateRecoveryCodes` (`:65-67`), an unconditional
 *    full-array replace.
 *
 * Failure mode at HEAD (proves RED): the method is absent on the repo, so the
 * cast-call resolves to `undefined` → `TypeError: ... is not a function` at
 * runtime — a behavioural RED (not a tsc-only error; the cast keeps it compiling).
 *
 * Run scope:
 *   RUN_INTEGRATION=true pnpm jest tests/integration/auth/totp-secret.repository.recovery.spec.ts --runInBand
 */

import bcrypt from 'bcrypt';

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { TotpRecoveryCode, TotpSecret } from '@modules/auth/domain/totp/totp-secret.entity';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';

type EncryptTotp = (secret: string) => string;
type RepoCtor = new (dataSource: IntegrationHarness['dataSource']) => ITotpSecretRepository;

/** Type pin (cycle T / R5) — the future port method. Absent at HEAD. */
type ConsumeRecoveryCode = (
  userId: number,
  index: number,
  at: Date,
) => Promise<{ affected: number }>;

let encryptTotpSecret: EncryptTotp;
let TotpSecretRepositoryPg: RepoCtor;

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('TotpSecretRepositoryPg.consumeRecoveryCode — atomic CAS (R5)', () => {
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
    repo = new TotpSecretRepositoryPg(harness.dataSource);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const seedRecoveryCodes = async (
    userId: number,
    email: string,
    consumedFlags: (string | null)[],
  ): Promise<void> => {
    const passwordHash = await bcrypt.hash('Test1234!', 4);
    await harness.dataSource.query(
      `INSERT INTO users (id, email, password, email_verified, role)
       VALUES ($1, $2, $3, true, 'admin')
       ON CONFLICT DO NOTHING`,
      [userId, email, passwordHash],
    );
    const codes: TotpRecoveryCode[] = await Promise.all(
      consumedFlags.map(async (consumedAt, i) => ({
        hash: await bcrypt.hash(`CODE${String(i).padStart(2, '0')}`, 4),
        consumedAt,
      })),
    );
    await harness.dataSource.query(
      `INSERT INTO totp_secrets (user_id, secret_encrypted, recovery_codes, enrolled_at)
       VALUES ($1, $2, $3::jsonb, now())`,
      [userId, encryptTotpSecret('JBSWY3DPEHPK3PXP'), JSON.stringify(codes)],
    );
  };

  it('consumes a null entry → {affected:1}, stamps that entry only (R5.a)', async () => {
    await seedRecoveryCodes(50101, 'rec1@test.musaium', [null, null, null]);

    const at = new Date('2026-05-21T17:00:00Z');
    const result = await (
      repo as unknown as { consumeRecoveryCode: ConsumeRecoveryCode }
    ).consumeRecoveryCode(50101, 1, at);

    expect(result).toEqual({ affected: 1 });
    const row = (await repo.findByUserId(50101)) as TotpSecret;
    expect(row.recoveryCodes[1].consumedAt).not.toBeNull();
    expect(row.recoveryCodes[0].consumedAt).toBeNull();
    expect(row.recoveryCodes[2].consumedAt).toBeNull();
  });

  it('already-consumed index → {affected:0}, no mutation (R5.b)', async () => {
    const already = '2026-05-20T00:00:00.000Z';
    await seedRecoveryCodes(50102, 'rec2@test.musaium', [null, already, null]);

    const result = await (
      repo as unknown as { consumeRecoveryCode: ConsumeRecoveryCode }
    ).consumeRecoveryCode(50102, 1, new Date('2099-01-01T00:00:00Z'));

    expect(result).toEqual({ affected: 0 });
    const row = (await repo.findByUserId(50102)) as TotpSecret;
    expect(row.recoveryCodes[1].consumedAt).toBe(already); // untouched
  });

  it('out-of-range index → {affected:0} (R5.c)', async () => {
    await seedRecoveryCodes(50103, 'rec3@test.musaium', [null, null]);

    const result = await (
      repo as unknown as { consumeRecoveryCode: ConsumeRecoveryCode }
    ).consumeRecoveryCode(50103, 99, new Date());

    expect(result).toEqual({ affected: 0 });
  });
});
