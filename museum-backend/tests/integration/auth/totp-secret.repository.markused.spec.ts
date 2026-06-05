/**
 * RED — T1.6 — R5 — `TotpSecretRepositoryPg.markUsed` MUST persist
 * `last_used_step` atomically with `last_used_at`.
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R5.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.2 — markUsed
 *   signature `(userId, at, step) => void` ; `lastUsedStep: String(step)`
 *   (TypeORM bigint → JS string per PATTERNS §6 type mapping).
 *
 * Anchored to PATTERNS / LESSONS :
 *  - `lib-docs/typeorm/PATTERNS.md` §3.3 "Update flows — three correct shapes"
 *    + §4.1 DON'T `field: undefined` (silent skip vulnerability).
 *  - `lib-docs/typeorm/LESSONS.md` 2026-05 verifyEmail/resetToken replay — the
 *    SAME silent-skip class of bug we're guarding here.
 *  - ESLint rule `musaium-test-discipline/no-typeorm-set-undefined` enforces it.
 *
 * Failure mode at HEAD `00325d81` :
 *  - `totp-secret.repository.pg.ts:53-55` `markUsed(userId, at)` — 2 args only,
 *    column `last_used_step` doesn't exist in DB. The 3-arg call below would
 *    fail TS today ; the cast pins the future contract. At runtime, the SQL
 *    SELECT for `last_used_step` returns no column → PG error 42703.
 *  - The integration harness runs all migrations from `data-source.ts`. The
 *    migration `AddTotpLastUsedStep` is not yet listed → column absent.
 *
 * Run scope :
 *   pnpm jest tests/integration/auth/totp-secret.repository.markused.spec.ts --runInBand
 */

import bcrypt from 'bcrypt';

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { TotpSecret } from '@modules/auth/domain/totp/totp-secret.entity';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';

// `@modules/auth/...` (both the repo + the encryption helper) transitively
// import `@src/config/env`, whose module-load reads PGDATABASE eagerly. If
// they are pulled at the top of this file, env caches the default
// 'museum_test' BEFORE `createIntegrationHarness()` has had a chance to pin
// PGDATABASE to the testcontainer DB name. Result on CI:
// `await import('@src/data/db/data-source')` inside the harness returns a
// DataSource still bound to 'museum_test' → AggregateError on first query
// → entire beforeAll fails → every test errors on undefined harness. Type-
// only imports (`TotpSecret`, `ITotpSecretRepository`) are erased and safe.
// Concrete bindings get lazy-required inside `beforeAll` after the harness
// has settled the env.
type EncryptTotp = (secret: string) => string;
type RepoCtor = new (dataSource: IntegrationHarness['dataSource']) => ITotpSecretRepository;
let encryptTotpSecret: EncryptTotp;
let TotpSecretRepositoryPg: RepoCtor;

/** Type pin — the entity gains `lastUsedStep: string | null` (bigint mapping). */
type RowWithStep = TotpSecret & { lastUsedStep: string | null };

/**
 * Type pin — the port gains a 3rd parameter `step: number`. Cycle T widened
 * the return to the CAS result `{ affected }` (`markUsed` is now an atomic
 * compare-and-set, see `MarkUsedCas` below + interface `:38`); these R5.a/b
 * call-sites ignore the return, so the alias matches the live signature.
 */
type MarkUsedWithStep = (userId: number, at: Date, step: number) => Promise<{ affected: number }>;

/**
 * Type pin (cycle T / R1) — `markUsed` becomes an atomic compare-and-set
 * returning `{ affected }`. Today it returns `void` and runs an UNCONDITIONAL
 * UPDATE (`totp-secret.repository.pg.ts:60-62`) — so `affected` is absent and
 * the row ALWAYS mutates regardless of the stored step. The cast pins the future
 * contract; the assertions below fail at HEAD for the right reason.
 */
type MarkUsedCas = (userId: number, at: Date, step: number) => Promise<{ affected: number }>;

// Post C3 follow-up: RUN_INTEGRATION guard per project pattern
// (cf. tests/integration/chat/chat-repository-typeorm.integration.test.ts).
// Skips in `pnpm test` ; runs only in `pnpm test:integration` CI job.
const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('TotpSecretRepositoryPg.markUsed — persists last_used_step (R5)', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;
  let repo: ITotpSecretRepository;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    // Lazy-require concrete bindings AFTER the harness has pinned
    // PGDATABASE — see file-top docblock for the env-cache race this dodges.

    encryptTotpSecret = (
      require('@modules/auth/useCase/totp/totpEncryption') as {
        encryptTotpSecret: EncryptTotp;
      }
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

  /**
   * Insert minimal user + totp_secrets row so the UPDATE has a target.
   * @param userId
   * @param email
   */
  const seedUserAndTotp = async (userId: number, email: string): Promise<void> => {
    const passwordHash = await bcrypt.hash('Test1234!', 4);
    // `users` timestamps are camelCase-quoted (`"createdAt"`/`"updatedAt"`) per
    // the initial migration; omitting them lets the column DEFAULT now() fire
    // and avoids the schema-drift trap.
    await harness.dataSource.query(
      `INSERT INTO users (id, email, password, email_verified, role)
       VALUES ($1, $2, $3, true, 'visitor')
       ON CONFLICT DO NOTHING`,
      [userId, email, passwordHash],
    );
    await harness.dataSource.query(
      `INSERT INTO totp_secrets (user_id, secret_encrypted, recovery_codes)
       VALUES ($1, $2, '[]'::jsonb)`,
      [userId, encryptTotpSecret('JBSWY3DPEHPK3PXP')],
    );
  };

  it('persists last_used_step as the supplied step value (R5.a)', async () => {
    await seedUserAndTotp(10001, 'r5a@test.musaium');

    const at = new Date('2026-05-21T17:00:00Z');
    const STEP = 58_259_640; // 2026-05-21T17:00:00Z UTC step

    await (repo.markUsed as MarkUsedWithStep)(10001, at, STEP);

    const row = (await repo.findByUserId(10001)) as RowWithStep | null;
    expect(row).not.toBeNull();
    // PG `bigint` → TypeORM string. Both `'58259640'` and equivalent numeric
    // forms accepted ; the canonical mapping is string.
    expect(row?.lastUsedStep).toBe(String(STEP));
    expect(row?.lastUsedAt).not.toBeNull();
  });

  it('overwrites last_used_step on subsequent call (R5.b — idempotent, monotonic)', async () => {
    await seedUserAndTotp(10002, 'r5b@test.musaium');

    const at1 = new Date('2026-05-21T17:00:00Z');
    const at2 = new Date('2026-05-21T17:00:30Z');

    await (repo.markUsed as MarkUsedWithStep)(10002, at1, 58_259_640);
    await (repo.markUsed as MarkUsedWithStep)(10002, at2, 58_259_641);

    const row = (await repo.findByUserId(10002)) as RowWithStep | null;
    expect(row?.lastUsedStep).toBe('58259641');
  });

  it('column `last_used_step` exists on totp_secrets table (R5.c — migration schema)', async () => {
    const cols = await harness.dataSource.query<
      { column_name: string; data_type: string; is_nullable: 'YES' | 'NO' }[]
    >(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'totp_secrets' AND column_name = 'last_used_step'`,
    );
    expect(cols).toHaveLength(1);
    expect(cols[0].data_type).toBe('bigint');
    expect(cols[0].is_nullable).toBe('YES'); // R6 — nullable so existing rows survive migration
  });
});

describeIntegration('TotpSecretRepositoryPg.markUsed — atomic compare-and-set (R1)', () => {
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

  const seedWithStep = async (
    userId: number,
    email: string,
    lastUsedStep: string | null,
  ): Promise<void> => {
    const passwordHash = await bcrypt.hash('Test1234!', 4);
    await harness.dataSource.query(
      `INSERT INTO users (id, email, password, email_verified, role)
       VALUES ($1, $2, $3, true, 'admin')
       ON CONFLICT DO NOTHING`,
      [userId, email, passwordHash],
    );
    await harness.dataSource.query(
      `INSERT INTO totp_secrets (user_id, secret_encrypted, recovery_codes, last_used_step)
       VALUES ($1, $2, '[]'::jsonb, $3)`,
      [userId, encryptTotpSecret('JBSWY3DPEHPK3PXP'), lastUsedStep],
    );
  };

  it('returns {affected:1} and stamps when step > last_used_step (R1)', async () => {
    await seedWithStep(10101, 'cas1@test.musaium', '58259640');

    const at = new Date('2026-05-21T17:00:30Z');
    const result = await (repo.markUsed as unknown as MarkUsedCas)(10101, at, 58_259_641);

    expect(result).toEqual({ affected: 1 });
    const row = (await repo.findByUserId(10101)) as RowWithStep | null;
    expect(row?.lastUsedStep).toBe('58259641');
  });

  it('returns {affected:1} and stamps when last_used_step IS NULL (R1 — first use)', async () => {
    await seedWithStep(10102, 'cas2@test.musaium', null);

    const result = await (repo.markUsed as unknown as MarkUsedCas)(10102, new Date(), 58_259_641);

    expect(result).toEqual({ affected: 1 });
    const row = (await repo.findByUserId(10102)) as RowWithStep | null;
    expect(row?.lastUsedStep).toBe('58259641');
  });

  it('returns {affected:0} and does NOT mutate when step === last_used_step (R1 — exact replay)', async () => {
    await seedWithStep(10103, 'cas3@test.musaium', '58259641');

    const result = await (repo.markUsed as unknown as MarkUsedCas)(
      10103,
      new Date('2099-01-01T00:00:00Z'),
      58_259_641,
    );

    expect(result).toEqual({ affected: 0 }); // fails today (unconditional UPDATE → row mutates, no affected)
    const row = (await repo.findByUserId(10103)) as RowWithStep | null;
    expect(row?.lastUsedStep).toBe('58259641'); // unchanged
  });

  it('returns {affected:0} and does NOT mutate when step < last_used_step (R1 — past replay)', async () => {
    await seedWithStep(10104, 'cas4@test.musaium', '58259641');

    const result = await (repo.markUsed as unknown as MarkUsedCas)(10104, new Date(), 58_259_640);

    expect(result).toEqual({ affected: 0 });
    const row = (await repo.findByUserId(10104)) as RowWithStep | null;
    expect(row?.lastUsedStep).toBe('58259641'); // unchanged — older step rejected
  });
});
