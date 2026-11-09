import { makeLead } from '../../helpers/leads/lead.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { LeadDTO, LeadType } from '@modules/leads/domain/lead/lead.types';
import type { ScheduledJobResult } from '@shared/queue/scheduled-jobs';

type LeadDeliveryNotifier = { notify: (p: never) => Promise<void> } | { subscribe: jest.Mock };
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

function makeResolver(behaviour: { b2b?: () => Promise<void>; beta?: () => Promise<void> }): {
  resolve: (type: LeadType) => { notify: jest.Mock } | { subscribe: jest.Mock };
  b2bNotify: jest.Mock;
  betaSubscribe: jest.Mock;
} {
  const b2bNotify = jest.fn(behaviour.b2b ?? (async () => undefined));
  const betaSubscribe = jest.fn(behaviour.beta ?? (async () => undefined));
  return {
    b2bNotify,
    betaSubscribe,
    resolve: (type: LeadType) =>
      type === 'b2b' ? { notify: b2bNotify } : { subscribe: betaSubscribe },
  };
}

const CONFIG = {
  maxAttempts: 5,
  batchLimit: 100,
  retentionDays: 90,
  backoffBaseMs: 60_000,
  backoffCapMs: 3_600_000,
};

describe('RedeliverPendingLeadsUseCase — selection + transition (R8/R9/R10/R11)', () => {
  it('re-notifies eligible failed/pending leads and marks them delivered (R8)', async () => {
    const failedB2b = makeLead({ id: 'lead-b2b-1', type: 'b2b', status: 'failed', attempts: 1 });
    const pendingBeta = makeLead({
      id: 'lead-beta-1',
      type: 'beta',
      status: 'pending',
      attempts: 0,
    });
    const repo: ILeadRepository = {
      ...makeStubLeadRepository(),
      selectRedeliverable: jest.fn(async () => [failedB2b, pendingBeta]),
    };
    const markDelivered = jest.fn(async () => undefined);
    repo.markDelivered = markDelivered;
    const resolver = makeResolver({});

    const useCase = new RedeliverPendingLeadsUseCase(repo, resolver.resolve, CONFIG);
    const result = await useCase.execute();

    expect(repo.selectRedeliverable).toHaveBeenCalledWith(CONFIG.maxAttempts, CONFIG.batchLimit);
    expect(resolver.b2bNotify).toHaveBeenCalledTimes(1);
    expect(resolver.betaSubscribe).toHaveBeenCalledTimes(1);
    expect(markDelivered).toHaveBeenCalledWith('lead-b2b-1');
    expect(markDelivered).toHaveBeenCalledWith('lead-beta-1');
    expect(result.rowsAffected).toBeGreaterThanOrEqual(2);
  });

  it('idempotent — only acts on selectRedeliverable output, never on delivered (R9)', async () => {
    const repo: ILeadRepository = {
      ...makeStubLeadRepository(),
      selectRedeliverable: jest.fn(async () => [] as LeadDTO[]),
    };
    const markDelivered = jest.fn(async () => undefined);
    repo.markDelivered = markDelivered;
    const resolver = makeResolver({});

    const useCase = new RedeliverPendingLeadsUseCase(repo, resolver.resolve, CONFIG);
    const result = await useCase.execute();

    expect(resolver.b2bNotify).not.toHaveBeenCalled();
    expect(resolver.betaSubscribe).not.toHaveBeenCalled();
    expect(markDelivered).not.toHaveBeenCalled();
    expect(result.rowsAffected).toBe(0);
  });

  it('forwards the maxAttempts cap to selectRedeliverable (R10)', async () => {
    const repo: ILeadRepository = {
      ...makeStubLeadRepository(),
      selectRedeliverable: jest.fn(async () => [] as LeadDTO[]),
    };
    const resolver = makeResolver({});

    const useCase = new RedeliverPendingLeadsUseCase(repo, resolver.resolve, {
      ...CONFIG,
      maxAttempts: 3,
    });
    await useCase.execute();

    expect(repo.selectRedeliverable).toHaveBeenCalledWith(3, CONFIG.batchLimit);
  });

  it('on repeated failure marks the lead failed, never delivered (R11)', async () => {
    const failed = makeLead({ id: 'lead-x', type: 'beta', status: 'failed', attempts: 1 });
    const repo: ILeadRepository = {
      ...makeStubLeadRepository(),
      selectRedeliverable: jest.fn(async () => [failed]),
    };
    const markDelivered = jest.fn(async () => undefined);
    const markFailed = jest.fn(async (_id: string, _lastError: string) => undefined);
    repo.markDelivered = markDelivered;
    repo.markFailed = markFailed;
    const resolver = makeResolver({
      beta: async () => {
        throw new Error('Brevo 503 still down');
      },
    });

    const useCase = new RedeliverPendingLeadsUseCase(repo, resolver.resolve, CONFIG);
    await useCase.execute();

    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(markFailed).toHaveBeenCalledWith('lead-x', expect.any(String));
    expect(markDelivered).not.toHaveBeenCalled();
  });

  it('runs the retention purge in the same handler (D6)', async () => {
    const repo: ILeadRepository = {
      ...makeStubLeadRepository(),
      selectRedeliverable: jest.fn(async () => [] as LeadDTO[]),
    };
    const purge = jest.fn(async () => 0);
    repo.purgeDeliveredOlderThan = purge;
    const resolver = makeResolver({});

    const useCase = new RedeliverPendingLeadsUseCase(repo, resolver.resolve, CONFIG);
    await useCase.execute();

    expect(purge).toHaveBeenCalledTimes(1);
  });
});
