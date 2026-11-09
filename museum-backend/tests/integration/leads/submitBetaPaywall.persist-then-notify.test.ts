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
