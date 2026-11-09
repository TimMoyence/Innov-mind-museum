import bcrypt from 'bcrypt';

import { makeSmokeEmail, type SmokeCredentials } from 'tests/helpers/auth/smoke-account.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import { User } from '@modules/auth/domain/user/user.entity';

type CreateSmokeAccount = (
  dataSource: IntegrationHarness['dataSource'],
  args: { email: string },
) => Promise<{
  userId: number;
  createdUser: boolean;
  password: string;
  consents: { created: string[]; alreadyActive: string[] };
}>;

type CleanupSmokeAccount = (
  dataSource: IntegrationHarness['dataSource'],
  args: { email: string },
) => Promise<{ deleted: boolean; userId?: number }>;

let createSmokeAccount: CreateSmokeAccount;
let cleanupSmokeAccount: CleanupSmokeAccount;
let SMOKE_CONSENT_SCOPES: readonly string[];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration(
  'seed-smoke-account.ts — ephemeral create→connectable→cleanup lifecycle',
  () => {
    jest.setTimeout(300_000);

    let harness: IntegrationHarness;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();

      const mod = require('../../../scripts/seed-smoke-account') as {
        createSmokeAccount: CreateSmokeAccount;
        cleanupSmokeAccount: CleanupSmokeAccount;
        SMOKE_CONSENT_SCOPES: readonly string[];
      };
      createSmokeAccount = mod.createSmokeAccount;
      cleanupSmokeAccount = mod.cleanupSmokeAccount;
      SMOKE_CONSENT_SCOPES = mod.SMOKE_CONSENT_SCOPES;
    });

    beforeEach(async () => {
      await harness.reset();
    });

    type CountRow = { c: number };

    const queryCount = async (sql: string, params: unknown[] = []): Promise<number> => {
      const rows = (await harness.dataSource.query(sql, params)) as CountRow[];
      return rows[0]?.c ?? 0;
    };

    const countChatSessionsForUser = (userId: number): Promise<number> =>
      queryCount('SELECT COUNT(*)::int AS c FROM "chat_sessions" WHERE "userId" = $1', [userId]);

    const countOrphanChatSessions = (): Promise<number> =>
      queryCount('SELECT COUNT(*)::int AS c FROM "chat_sessions" WHERE "userId" IS NULL');

    const countRefreshTokensForUser = (userId: number): Promise<number> =>
      queryCount('SELECT COUNT(*)::int AS c FROM "auth_refresh_tokens" WHERE "userId" = $1', [
        userId,
      ]);

    it('create → fresh connectable visitor (R1/R8): email_verified, role=visitor, bcrypt-verifiable random password, consents active', async () => {
      const email = makeSmokeEmail('lifecycle-r1');

      const result = await createSmokeAccount(harness.dataSource, { email });

      expect(result.createdUser).toBe(true);
      expect(result.userId).toBeGreaterThan(0);
      expect(typeof result.password).toBe('string');
      expect(result.password.length).toBeGreaterThanOrEqual(32);

      const repo = harness.dataSource.getRepository(User);
      const row = await repo.findOne({ where: { email } });
      expect(row).not.toBeNull();
      expect(row?.email_verified).toBe(true);
      expect(row?.role).toBe('visitor');
      expect(row?.onboarding_completed).toBe(true);

      expect(row?.password).not.toBe(result.password);
      await expect(bcrypt.compare(result.password, row?.password ?? '')).resolves.toBe(true);

      for (const scope of SMOKE_CONSENT_SCOPES) {
        const active = await queryCount(
          'SELECT COUNT(*)::int AS c FROM "user_consents" WHERE "user_id" = $1 AND "scope" = $2 AND "revoked_at" IS NULL',
          [result.userId, scope],
        );
        expect(active).toBe(1);
      }
    });

    it('cleanup hard-deletes the user AND all children (R4): 0 users, 0 chat_sessions for user, 0 orphan session, 0 refresh tokens, 0 consents', async () => {
      const email = makeSmokeEmail('lifecycle-r4');
      const { userId } = await createSmokeAccount(harness.dataSource, { email });

      await harness.dataSource.query(
        'INSERT INTO "chat_sessions" (id, "userId", "museumMode", intent, version) ' +
          "VALUES (gen_random_uuid(), $1, false, 'default', 1)",
        [userId],
      );
      await harness.dataSource.query(
        'INSERT INTO "auth_refresh_tokens" (id, "userId", jti, "familyId", "tokenHash", "issuedAt", "expiresAt") ' +
          "VALUES (gen_random_uuid(), $1, gen_random_uuid(), gen_random_uuid(), 'hash', now(), now() + interval '1 day')",
        [userId],
      );

      expect(await countChatSessionsForUser(userId)).toBe(1);
      expect(await countRefreshTokensForUser(userId)).toBe(1);

      const res = await cleanupSmokeAccount(harness.dataSource, { email });
      expect(res.deleted).toBe(true);

      const userRepo = harness.dataSource.getRepository(User);
      expect(await userRepo.count({ where: { email } })).toBe(0);
      expect(await countChatSessionsForUser(userId)).toBe(0);
      expect(await countOrphanChatSessions()).toBe(0);
      expect(await countRefreshTokensForUser(userId)).toBe(0);
      expect(
        await queryCount('SELECT COUNT(*)::int AS c FROM "user_consents" WHERE "user_id" = $1', [
          userId,
        ]),
      ).toBe(0);
    });

    it('cleanup is idempotent (R4): second cleanup returns { deleted: false } and does not throw', async () => {
      const email = makeSmokeEmail('lifecycle-idem');
      await createSmokeAccount(harness.dataSource, { email });
      await cleanupSmokeAccount(harness.dataSource, { email });

      const second = await cleanupSmokeAccount(harness.dataSource, { email });
      expect(second.deleted).toBe(false);
    });

    it('create over a residual same-email row wipes + reinserts (R2): new password authenticates, old does not, exactly one row', async () => {
      const email = makeSmokeEmail('lifecycle-r2');
      const oldCreds: SmokeCredentials = {
        email,
        password: 'Old!Residual-Password-123',
      };

      const oldHash = await bcrypt.hash(oldCreds.password, 12);
      await harness.dataSource.query(
        'INSERT INTO "users" (email, password, firstname, lastname, role, email_verified, onboarding_completed, "createdAt", "updatedAt") ' +
          "VALUES ($1, $2, 'Smoke', 'Test', 'visitor', true, true, now(), now())",
        [email, oldHash],
      );

      const result = await createSmokeAccount(harness.dataSource, { email });
      expect(result.createdUser).toBe(true);

      const userRepo = harness.dataSource.getRepository(User);
      const rows = await userRepo.find({ where: { email } });
      expect(rows).toHaveLength(1);

      const storedHash = rows[0].password ?? '';
      await expect(bcrypt.compare(result.password, storedHash)).resolves.toBe(true);
      await expect(bcrypt.compare(oldCreds.password, storedHash)).resolves.toBe(false);
    });
  },
);
