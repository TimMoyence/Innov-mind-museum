/**
 * T3.2 (RED — Cycle B « Aucun lead perdu » — UFR-022 fresh-context red phase).
 *
 * Mirror of T3.1 for the beta-signup + paywall-interest use-cases (no B2B
 * dedup → `dedupKey` null). Pins the persist-then-notify invariant against a
 * REAL Postgres + REAL `LeadRepositoryPg`, Brevo notifier mocked:
 *
 *   (R1) persist `pending` BEFORE `subscribe` is called (order proven).
 *   (R2) subscribe resolves → row delivered, deliveredAt set, attempts ≥ 1.
 *   (R3) subscribe THROWS → lead NEVER lost: row failed, attempts = 1, no
 *        rethrow.
 *   (R7) honeypot → 0 row, 0 notify.
 *   Paywall additionally persists `source: 'paywall_premium_interest'` inside
 *   the jsonb payload.
 *
 * RED reason at baseline: both use-cases are stateless — they take only a
 * notifier and never persist (`submitBetaSignup.useCase.ts:30,67`,
 * `submitPaywallInterest.useCase.ts:29,61`). Green (T3.4) injects the repo.
 *
 * Constructor invoked via the GREEN 2-arg `(notifier, repo)` signature, bridged
 * with a constructor-type cast (keeps tsc green; runtime persistence assertions
 * fail red). Mirror `tests/integration/support/ticket-museum-scope.test.ts`.
 *
 * Maps: R1, R2, R3, R7.
 */
import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';
import { SubmitPaywallInterestUseCase } from '@modules/leads/useCase/submitPaywallInterest.useCase';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { makeBetaSignupPayload } from 'tests/helpers/leads/betaSignup.fixtures';
import { PgLeadRepositoryHarness } from 'tests/helpers/leads/pgLeadRepository.harness';

import { Lead } from '@modules/leads/domain/lead/lead.entity';

import type { BetaSignupNotifier } from '@modules/leads/domain/ports/beta-signup-notifier.port';
import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

/** GREEN ctor surface `(notifier, repo)`; baseline only declares `(notifier)`. */
type BetaCtor = new (
  notifier: BetaSignupNotifier,
  repo: ILeadRepository,
) => SubmitBetaSignupUseCase;
type PaywallCtor = new (
  notifier: BetaSignupNotifier,
  repo: ILeadRepository,
) => SubmitPaywallInterestUseCase;

describeIntegration(
  'SubmitBetaSignup / SubmitPaywallInterest — persist-then-notify [integration, real PG]',
  () => {
    jest.setTimeout(180_000);

    let harness: IntegrationHarness;
    let repo: ILeadRepository;
    let leadRepo: Repository<Lead>;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      repo = new PgLeadRepositoryHarness(harness.dataSource);
      leadRepo = harness.dataSource.getRepository(Lead);
    });

    beforeEach(async () => {
      await harness.reset();
    });

    const BetaUseCase = SubmitBetaSignupUseCase as unknown as BetaCtor;
    const PaywallUseCase = SubmitPaywallInterestUseCase as unknown as PaywallCtor;

    describe('beta signup', () => {
      it('persists pending BEFORE subscribe (R1 — order)', async () => {
        let rowCountAtNotify = -1;
        const notifier: BetaSignupNotifier = {
          subscribe: jest.fn(async () => {
            rowCountAtNotify = await leadRepo.count();
            return { outcome: 'subscribed' as const };
          }),
        };
        const useCase = new BetaUseCase(notifier, repo);

        await useCase.execute(makeBetaSignupPayload());

        expect(notifier.subscribe).toHaveBeenCalledTimes(1);
        expect(rowCountAtNotify).toBe(1);
      });

      it('marks delivered when subscribe resolves (R2)', async () => {
        const notifier: BetaSignupNotifier = {
          subscribe: jest.fn(async () => ({ outcome: 'subscribed' as const })),
        };
        const useCase = new BetaUseCase(notifier, repo);

        await useCase.execute(makeBetaSignupPayload());

        const rows = await leadRepo.find();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.type).toBe('beta');
        expect(rows[0]?.status).toBe('delivered');
        expect(rows[0]?.deliveredAt).not.toBeNull();
        expect(rows[0]?.attempts).toBeGreaterThanOrEqual(1);
      });

      it('keeps the lead (failed, attempts=1) when subscribe throws — NEVER lost (R3)', async () => {
        const notifier: BetaSignupNotifier = {
          subscribe: jest.fn(async () => {
            throw new Error('Brevo 429 Too Many Requests');
          }),
        };
        const useCase = new BetaUseCase(notifier, repo);

        await expect(useCase.execute(makeBetaSignupPayload())).resolves.toBeUndefined();

        const rows = await leadRepo.find();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.status).toBe('failed');
        expect(rows[0]?.attempts).toBe(1);
        expect(rows[0]?.lastError).not.toBeNull();
      });

      it('honeypot hit → 0 row, 0 notify (R7)', async () => {
        const notifier: BetaSignupNotifier = {
          subscribe: jest.fn(async () => ({ outcome: 'subscribed' as const })),
        };
        const useCase = new BetaUseCase(notifier, repo);

        await useCase.execute(makeBetaSignupPayload({ website: 'http://bot.example' }));

        expect(notifier.subscribe).not.toHaveBeenCalled();
        expect(await leadRepo.count()).toBe(0);
      });
    });

    describe('paywall interest', () => {
      it('persists a paywall lead with source=paywall_premium_interest in the jsonb payload (R1/R2)', async () => {
        const notifier: BetaSignupNotifier = {
          subscribe: jest.fn(async () => ({ outcome: 'subscribed' as const })),
        };
        const useCase = new PaywallUseCase(notifier, repo);

        await useCase.execute(makeBetaSignupPayload({ email: 'paywall@example.com' }));

        const rows = await leadRepo.find();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.type).toBe('paywall');
        expect(rows[0]?.status).toBe('delivered');
        const payload = rows[0]?.payload as { source?: string } | undefined;
        expect(payload?.source).toBe('paywall_premium_interest');
      });

      it('keeps the paywall lead (failed) when subscribe throws — NEVER lost (R3)', async () => {
        const notifier: BetaSignupNotifier = {
          subscribe: jest.fn(async () => {
            throw new Error('Brevo timeout');
          }),
        };
        const useCase = new PaywallUseCase(notifier, repo);

        await expect(
          useCase.execute(makeBetaSignupPayload({ email: 'paywall@example.com' })),
        ).resolves.toBeUndefined();

        const rows = await leadRepo.find();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.status).toBe('failed');
        expect(rows[0]?.attempts).toBe(1);
      });
    });
  },
);
