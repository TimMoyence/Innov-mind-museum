import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { makeB2bLeadPayload } from 'tests/helpers/leads/b2bLead.fixtures';
import { PgLeadRepositoryHarness } from 'tests/helpers/leads/pgLeadRepository.harness';

import { Lead } from '@modules/leads/domain/lead/lead.entity';

import type {
  B2bLeadNotifier,
  B2bLeadPayload,
} from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

type B2bUseCaseCtor = new (
  notifier: B2bLeadNotifier,
  repo: ILeadRepository,
) => SubmitB2bLeadUseCase;

describeIntegration('SubmitB2bLeadUseCase — persist-then-notify [integration, real PG]', () => {
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

  const Ctor = SubmitB2bLeadUseCase as unknown as B2bUseCaseCtor;

  it('persists the lead pending BEFORE invoking the notifier (R1 — order)', async () => {
    let rowCountAtNotify = -1;
    const notifier: B2bLeadNotifier = {
      notify: jest.fn(async () => {
        rowCountAtNotify = await leadRepo.count();
      }),
    };
    const useCase = new Ctor(notifier, repo);

    await useCase.execute(makeB2bLeadPayload());

    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(rowCountAtNotify).toBe(1);
  });

  it('marks the lead delivered when the notifier resolves (R2)', async () => {
    const notifier: B2bLeadNotifier = { notify: jest.fn(async () => undefined) };
    const useCase = new Ctor(notifier, repo);

    await useCase.execute(makeB2bLeadPayload());

    const rows = await leadRepo.find();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('delivered');
    expect(rows[0]?.deliveredAt).not.toBeNull();
    expect(rows[0]?.attempts).toBeGreaterThanOrEqual(1);
  });

  it('keeps the lead (status failed, attempts=1) when the notifier throws — NEVER lost (R3)', async () => {
    const notifier: B2bLeadNotifier = {
      notify: jest.fn(async () => {
        throw new Error('Brevo 503 Service Unavailable');
      }),
    };
    const useCase = new Ctor(notifier, repo);

    await expect(useCase.execute(makeB2bLeadPayload())).resolves.toBeUndefined();

    const rows = await leadRepo.find();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.lastError).not.toBeNull();
  });

  it('honeypot hit → 0 row persisted, 0 notify (R7)', async () => {
    const notifier: B2bLeadNotifier = { notify: jest.fn(async () => undefined) };
    const useCase = new Ctor(notifier, repo);

    await useCase.execute(makeB2bLeadPayload({ website: 'http://spam.example' }));

    expect(notifier.notify).not.toHaveBeenCalled();
    expect(await leadRepo.count()).toBe(0);
  });

  it('two identical B2B submits → ONE notify, no duplicate active row (R15 dedup)', async () => {
    const notifier: B2bLeadNotifier = { notify: jest.fn(async () => undefined) };
    const useCase = new Ctor(notifier, repo);

    const payload: B2bLeadPayload = makeB2bLeadPayload({
      email: 'dedup@museum.fr',
      museum: 'Same Museum',
    });

    await useCase.execute(payload);
    await useCase.execute(payload);

    expect(notifier.notify).toHaveBeenCalledTimes(1);
    const active = await leadRepo.count({
      where: [{ status: 'pending' }, { status: 'delivered' }],
    });
    expect(active).toBe(1);
  });
});
