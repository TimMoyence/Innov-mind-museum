/**
 * RED — Regression lock for the 5th deploy-prod cascade layer :
 *   llm-promptfoo-smoke (cron) → 0/10 recall because the seeded smoke
 *   user had no `third_party_ai_text_openai` consent, so every chat POST
 *   returned the synthetic `consent_refusal::<scope>` text instead of
 *   real LLM output. Same root cause sibling :
 *     - smoke-api.cjs (prod deploy)  — fixed at HTTP layer in 294467c2a
 *     - llm-security-promptfoo cron  — silently broken since GDPR #294
 *     - ci-cd-backend.yml staging+prod smoke — same risk
 *
 * Fix : `scripts/seed-smoke-account.ts` now inserts active `user_consents`
 * rows for `third_party_ai_text_openai` and `third_party_ai_audio_openai`
 * at seed time. Centralized so all 4 workflows using `seed:smoke-account`
 * inherit the fix from one place.
 *
 * Run scope :
 *   RUN_INTEGRATION=true pnpm jest tests/integration/scripts/seed-smoke-account.consents.spec.ts --runInBand
 */

import { IsNull } from 'typeorm';

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import { UserConsent } from '@modules/auth/domain/consent/userConsent.entity';

type SeedSmokeAccount = (
  dataSource: IntegrationHarness['dataSource'],
  credentials: { email: string; password: string },
) => Promise<{
  userId: number;
  createdUser: boolean;
  consents: { created: string[]; alreadyActive: string[] };
}>;

type EnsureSmokeConsents = (
  dataSource: IntegrationHarness['dataSource'],
  userId: number,
) => Promise<{ created: string[]; alreadyActive: string[] }>;

let seedSmokeAccount: SeedSmokeAccount;
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
      // Lazy-require AFTER harness has pinned PGDATABASE — env-cache race
      // protection (same pattern as the TOTP + seed-museums integration specs).

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require: must run AFTER harness pins PGDATABASE (env-cache race protection)
      const mod = require('../../../scripts/seed-smoke-account') as {
        seedSmokeAccount: SeedSmokeAccount;
        ensureSmokeConsents: EnsureSmokeConsents;
        SMOKE_CONSENT_SCOPES: readonly string[];
      };
      seedSmokeAccount = mod.seedSmokeAccount;
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

    it('first run on a fresh DB creates user + grants every required consent (R2)', async () => {
      const result = await seedSmokeAccount(harness.dataSource, {
        email: 'smoke+r2@test.musaium',
        password: 'Sm0ke!R2-Test',
      });

      expect(result.createdUser).toBe(true);
      expect(result.userId).toBeGreaterThan(0);
      expect(result.consents.created).toEqual(expect.arrayContaining([...SMOKE_CONSENT_SCOPES]));
      expect(result.consents.alreadyActive).toEqual([]);

      // DB invariant : exactly one ACTIVE row per required scope.
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

    it('re-running on an already-seeded user is idempotent — no duplicate consent rows (R3)', async () => {
      const credentials = { email: 'smoke+r3@test.musaium', password: 'Sm0ke!R3-Test' };

      const first = await seedSmokeAccount(harness.dataSource, credentials);
      const second = await seedSmokeAccount(harness.dataSource, credentials);

      expect(second.userId).toBe(first.userId);
      expect(second.createdUser).toBe(false);
      expect(second.consents.created).toEqual([]);
      expect(second.consents.alreadyActive).toEqual(
        expect.arrayContaining([...SMOKE_CONSENT_SCOPES]),
      );

      const repo = harness.dataSource.getRepository(UserConsent);
      const total = await repo.count({
        where: { userId: first.userId, revokedAt: IsNull() },
      });
      expect(total).toBe(SMOKE_CONSENT_SCOPES.length);
    });

    it('ensureSmokeConsents re-grants a scope after it has been revoked (R4 — recovery)', async () => {
      const credentials = { email: 'smoke+r4@test.musaium', password: 'Sm0ke!R4-Test' };
      const { userId } = await seedSmokeAccount(harness.dataSource, credentials);

      // Simulate an admin / GDPR revoke for the text scope.
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

      // Re-running the seed step re-grants because the prior row is no longer active.
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
