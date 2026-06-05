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
 * Fix : `scripts/seed-smoke-account.ts` inserts active `user_consents`
 * rows for `third_party_ai_text_openai` and `third_party_ai_audio_openai`
 * at create time. Centralized so all 4 workflows using `seed:smoke-account`
 * inherit the fix from one place.
 *
 * Cycle C (run 2026-05-26-auth-mfa-rgpd-zerodefect) — the permanent
 * `seedSmokeAccount` upsert is REPLACED by the ephemeral `createSmokeAccount`
 * (fresh insert + random password, no update/heal branch). This spec migrates
 * its R2/R3/R4 consent assertions onto the new surface: R2/R3 idempotence is
 * now expressed as `create → cleanup → create` (delete-then-insert, no
 * resident account), and R4 (revoke→re-grant) stays on `ensureSmokeConsents`.
 *
 * Run scope :
 *   RUN_INTEGRATION=true pnpm jest tests/integration/scripts/seed-smoke-account.consents.spec.ts --runInBand
 */

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
      // Lazy-require AFTER harness has pinned PGDATABASE — env-cache race
      // protection (same pattern as the TOTP + seed-museums integration specs).

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require: must run AFTER harness pins PGDATABASE (env-cache race protection)
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

    it('create → cleanup → create yields a fresh account with no duplicate consent rows (R3 — ephemeral, not heal)', async () => {
      const email = makeSmokeEmail('consents-r3');

      const first = await createSmokeAccount(harness.dataSource, { email });
      await cleanupSmokeAccount(harness.dataSource, { email });
      const second = await createSmokeAccount(harness.dataSource, { email });

      // Ephemeral: every create is a fresh insert (no upsert/heal).
      expect(second.createdUser).toBe(true);
      expect(second.consents.created).toEqual(expect.arrayContaining([...SMOKE_CONSENT_SCOPES]));
      expect(second.consents.alreadyActive).toEqual([]);

      // The first account is gone; the second carries exactly the required scopes.
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

      // Re-running the consent step re-grants because the prior row is no longer active.
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
