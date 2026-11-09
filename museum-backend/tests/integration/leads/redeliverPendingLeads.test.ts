import { LeadRepositoryPg } from '@modules/leads/adapters/secondary/pg/lead.repository.pg';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { makeBetaSignupPayload } from 'tests/helpers/leads/betaSignup.fixtures';
import { makeLeadInput } from 'tests/helpers/leads/lead.fixtures';

import { Lead } from '@modules/leads/domain/lead/lead.entity';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { LeadPayload, LeadType } from '@modules/leads/domain/lead/lead.types';
import type { ScheduledJobResult } from '@shared/queue/scheduled-jobs';
import type { Repository } from 'typeorm';

type LeadDeliveryNotifier = { notify: jest.Mock } | { subscribe: jest.Mock };
interface RedeliverConfig {
  maxAttempts: number;
  batchLimit: number;
  retentionDays: number;
  backoffBaseMs: number;
  backoffCapMs: number;
}
type RedeliverPendingLeadsUseCaseCtor = new (
  repo: ILeadRepository,
  resolveNotifier: (type: LeadType) => LeadDeliveryNotifier,
  config: RedeliverConfig,
) => { execute: () => Promise<ScheduledJobResult> };

const { RedeliverPendingLeadsUseCase } =
  require('@modules/leads/useCase/redeliverPendingLeads.useCase') as {
    RedeliverPendingLeadsUseCase: RedeliverPendingLeadsUseCaseCtor;
  };

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const CONFIG = {
  maxAttempts: 5,
  batchLimit: 100,
  retentionDays: 90,
  backoffBaseMs: 60_000,
  backoffCapMs: 3_600_000,
};

function resolverThatSucceeds(): (
  type: LeadType,
) => { subscribe: jest.Mock } | { notify: jest.Mock } {
  const subscribe = jest.fn(async () => undefined);
  const notify = jest.fn(async () => undefined);
  return (type: LeadType) => (type === 'b2b' ? { notify } : { subscribe });
}

function resolverThatThrows(): (
  type: LeadType,
) => { subscribe: jest.Mock } | { notify: jest.Mock } {
  const fail = jest.fn(async () => {
    throw new Error('Brevo 503 still down');
  });
  return (type: LeadType) => (type === 'b2b' ? { notify: fail } : { subscribe: fail });
}

describeIntegration('RedeliverPendingLeadsUseCase — reliability [integration, real PG]', () => {
  let harness: IntegrationHarness;
  let repo: LeadRepositoryPg;
  let leadRepo: Repository<Lead>;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    repo = new LeadRepositoryPg(harness.dataSource);
    leadRepo = harness.dataSource.getRepository(Lead);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it('re-delivers a failed lead → delivered (R8)', async () => {
    const lead = await repo.insertPending(makeLeadInput({ type: 'beta' }));
    await repo.markFailed(lead.id, 'Brevo 503');

    const useCase = new RedeliverPendingLeadsUseCase(repo, resolverThatSucceeds(), CONFIG);
    const result = await useCase.execute();

    const row = await leadRepo.findOneByOrFail({ id: lead.id });
    expect(row.status).toBe('delivered');
    expect(row.deliveredAt).not.toBeNull();
    expect(result.rowsAffected).toBeGreaterThanOrEqual(1);
  });

  it('never re-selects a delivered lead; running twice does not double-deliver (R9)', async () => {
    const lead = await repo.insertPending(makeLeadInput({ type: 'beta' }));
    await repo.markFailed(lead.id, 'Brevo 503');

    const useCase = new RedeliverPendingLeadsUseCase(repo, resolverThatSucceeds(), CONFIG);
    await useCase.execute();
    const afterFirst = await leadRepo.findOneByOrFail({ id: lead.id });
    const attemptsAfterFirst = afterFirst.attempts;

    await useCase.execute();
    const afterSecond = await leadRepo.findOneByOrFail({ id: lead.id });

    expect(afterSecond.status).toBe('delivered');
    expect(afterSecond.attempts).toBe(attemptsAfterFirst);
  });

  it('does not select a lead at attempts = maxAttempts (terminal, R10)', async () => {
    const lead = await repo.insertPending(makeLeadInput({ type: 'beta' }));
    for (let i = 0; i < CONFIG.maxAttempts; i++) {
      await repo.markFailed(lead.id, 'Brevo 503');
      await leadRepo.update({ id: lead.id }, { nextEligibleAt: null });
    }

    const useCase = new RedeliverPendingLeadsUseCase(repo, resolverThatSucceeds(), CONFIG);
    await useCase.execute();

    const row = await leadRepo.findOneByOrFail({ id: lead.id });
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(CONFIG.maxAttempts);
  });

  it('on repeated failure increments attempts and pushes nextEligibleAt forward (R11)', async () => {
    const lead = await repo.insertPending(makeLeadInput({ type: 'beta' }));
    await repo.markFailed(lead.id, 'Brevo 503');
    await leadRepo.update({ id: lead.id }, { nextEligibleAt: null });

    const useCase = new RedeliverPendingLeadsUseCase(repo, resolverThatThrows(), CONFIG);
    await useCase.execute();

    const row = await leadRepo.findOneByOrFail({ id: lead.id });
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(2);
    expect(row.nextEligibleAt).not.toBeNull();
    expect(row.nextEligibleAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('purges delivered leads older than the retention cutoff, keeps pending/failed (D6)', async () => {
    const old = await repo.insertPending(makeLeadInput({ type: 'beta' }));
    await repo.markDelivered(old.id);
    const cutoffPast = new Date(Date.now() - (CONFIG.retentionDays + 1) * 24 * 60 * 60 * 1000);
    await leadRepo.update({ id: old.id }, { deliveredAt: cutoffPast });

    const kept = await repo.insertPending(
      makeLeadInput({ type: 'beta', payload: makeBetaSignupPayload() as LeadPayload }),
    );
    await repo.markFailed(kept.id, 'Brevo 503');

    const useCase = new RedeliverPendingLeadsUseCase(repo, resolverThatThrows(), CONFIG);
    await useCase.execute();

    const oldRow = await leadRepo.findOneBy({ id: old.id });
    expect(oldRow).toBeNull();
    const keptRow = await leadRepo.findOneBy({ id: kept.id });
    expect(keptRow).not.toBeNull();
  });
});
