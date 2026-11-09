import { IsNull } from 'typeorm';

import { makeSmokeEmail } from 'tests/helpers/auth/smoke-account.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import { UserConsent } from '@modules/auth/domain/consent/userConsent.entity';

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

type EnsureSmokeConsents = (
  dataSource: IntegrationHarness['dataSource'],
  userId: number,
) => Promise<{ created: string[]; alreadyActive: string[] }>;

let createSmokeAccount: CreateSmokeAccount;
let cleanupSmokeAccount: CleanupSmokeAccount;
let ensureSmokeConsents: EnsureSmokeConsents;
let SMOKE_CONSENT_SCOPES: readonly string[];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration(
  'seed-smoke-account.ts — must grant the consents the chat consent-gate requires',
  () => {
    jest.setTimeout(300_000);

    let harness: IntegrationHarness;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();

      const mod = require('../../../scripts/seed-smoke-account') as {
        createSmokeAccount: CreateSmokeAccount;
        cleanupSmokeAccount: CleanupSmokeAccount;
        ensureSmokeConsents: EnsureSmokeConsents;
        SMOKE_CONSENT_SCOPES: readonly string[];
      };
      createSmokeAccount = mod.createSmokeAccount;
      cleanupSmokeAccount = mod.cleanupSmokeAccount;
      ensureSmokeConsents = mod.ensureSmokeConsents;
      SMOKE_CONSENT_SCOPES = mod.SMOKE_CONSENT_SCOPES;
    });

    beforeEach(async () => {
      await harness.reset();
    });

    it('SMOKE_CONSENT_SCOPES covers the 2 scopes the chat happy path needs (R1)', () => {
      expect(SMOKE_CONSENT_SCOPES).toEqual(
        expect.arrayContaining(['third_party_ai_text_openai', 'third_party_ai_audio_openai']),
      );
      expect(SMOKE_CONSENT_SCOPES).toHaveLength(2);
    });

    it('create on a fresh DB inserts user + grants every required consent (R2)', async () => {
      const result = await createSmokeAccount(harness.dataSource, {
        email: makeSmokeEmail('consents-r2'),
      });

      expect(result.createdUser).toBe(true);
      expect(result.userId).toBeGreaterThan(0);
      expect(result.consents.created).toEqual(expect.arrayContaining([...SMOKE_CONSENT_SCOPES]));
      expect(result.consents.alreadyActive).toEqual([]);

      const repo = harness.dataSource.getRepository(UserConsent);
      for (const scope of SMOKE_CONSENT_SCOPES) {
        const rows = await repo.find({
          where: { userId: result.userId, scope, revokedAt: IsNull() },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].source).toBe('registration');
        expect(rows[0].version).toBe('1.0');
      }
    });

    it('create → cleanup → create yields a fresh account with no duplicate consent rows (R3 — ephemeral, not heal)', async () => {
      const email = makeSmokeEmail('consents-r3');

      const first = await createSmokeAccount(harness.dataSource, { email });
      await cleanupSmokeAccount(harness.dataSource, { email });
      const second = await createSmokeAccount(harness.dataSource, { email });

      expect(second.createdUser).toBe(true);
      expect(second.consents.created).toEqual(expect.arrayContaining([...SMOKE_CONSENT_SCOPES]));
      expect(second.consents.alreadyActive).toEqual([]);

      const repo = harness.dataSource.getRepository(UserConsent);
      expect(await repo.count({ where: { userId: first.userId, revokedAt: IsNull() } })).toBe(0);
      expect(await repo.count({ where: { userId: second.userId, revokedAt: IsNull() } })).toBe(
        SMOKE_CONSENT_SCOPES.length,
      );
    });

    it('ensureSmokeConsents re-grants a scope after it has been revoked (R4 — recovery)', async () => {
      const { userId } = await createSmokeAccount(harness.dataSource, {
        email: makeSmokeEmail('consents-r4'),
      });

      const repo = harness.dataSource.getRepository(UserConsent);
      await repo.update({ userId, scope: 'third_party_ai_text_openai' }, { revokedAt: new Date() });
      const activeAfterRevoke = await repo.count({
        where: {
          userId,
          scope: 'third_party_ai_text_openai',
          revokedAt: IsNull(),
        },
      });
      expect(activeAfterRevoke).toBe(0);

      const result = await ensureSmokeConsents(harness.dataSource, userId);
      expect(result.created).toContain('third_party_ai_text_openai');

      const activeAfterReseed = await repo.count({
        where: {
          userId,
          scope: 'third_party_ai_text_openai',
          revokedAt: IsNull(),
        },
      });
      expect(activeAfterReseed).toBe(1);
    });
  },
);
