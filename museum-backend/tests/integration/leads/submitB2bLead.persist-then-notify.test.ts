/**
 * T3.1 (RED — Cycle B « Aucun lead perdu » — UFR-022 fresh-context red phase).
 *
 * Pins the persist-then-notify invariant for the B2B lead use-case against a
 * REAL Postgres-backed `ILeadRepository` (test-infra `PgLeadRepositoryHarness`,
 * so the failure is behavioural, not a module-not-found on the green adapter),
 * with the Brevo notifier mocked:
 *
 *   (a) R1 — the lead is persisted `pending` BEFORE the notifier is invoked
 *       (order proven: at the moment `notify` is called, the row already
 *       exists in the DB).
 *   (b) R2 — notifier resolves → row pending → delivered, deliveredAt set,
 *       attempts ≥ 1.
 *   (c) R3 — notifier THROWS → the lead is NEVER lost: the row exists with
 *       status `failed`, attempts = 1. The use-case does NOT rethrow.
 *   (d) R7 — honeypot (`website` non-empty) → 0 row persisted, 0 notify.
 *   (e) R15 — two identical B2B submits (email + museum) → ONE notify only
 *       (2nd recognised as a dedup hit; no duplicate active row).
 *
 * RED reason at baseline: `SubmitB2bLeadUseCase` is stateless — it takes only a
 * notifier and never writes to the DB (`submitB2bLead.useCase.ts:36,97`). So
 * every persistence assertion fails (no row), and on notifier throw the current
 * code rethrows (no `markFailed`). The green phase (T3.3) injects
 * `ILeadRepository` and implements persist-then-notify.
 *
 * The constructor is invoked via the GREEN 2-arg signature `(notifier, repo)`.
 * At baseline the class only accepts `(notifier)`, so the invocation is bridged
 * through a constructor-type cast (sanctioned repo red-phase pattern, mirror
 * `tests/integration/support/ticket-museum-scope.test.ts`) — this keeps tsc
 * green while the RUNTIME persistence assertions fail. The cast becomes a
 * no-op once the green signature lands.
 *
 * Maps: R1, R2, R3, R7, R15.
 *
 * Test discipline — payloads via `makeB2bLeadPayload()`; rows inspected via the
 * real repo + entity. Teardown via `harness.scheduleStop()`.
 */
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

/**
 * Constructor surface the GREEN use-case exposes: `(notifier, repo)`. At
 * baseline `SubmitB2bLeadUseCase` only declares `(notifier)`, so we widen the
 * class reference to this type to wire the repo. Runtime assertions are what
 * fail red — the cast only unblocks tsc.
 */
type B2bUseCaseCtor = new (
  notifier: B2bLeadNotifier,
  repo: ILeadRepository,
) => SubmitB2bLeadUseCase;

describeIntegration('SubmitB2bLeadUseCase — persist-then-notify [integration, real PG]', () => {
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

  const Ctor = SubmitB2bLeadUseCase as unknown as B2bUseCaseCtor;

  it('persists the lead pending BEFORE invoking the notifier (R1 — order)', async () => {
    let rowCountAtNotify = -1;
    const notifier: B2bLeadNotifier = {
      notify: jest.fn(async () => {
        // At the moment notify is called, the pending row must already exist.
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

    // R5 contract: the use-case does NOT rethrow on notifier failure.
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
    // No duplicate active (pending|delivered) row for the same dedup key.
    const active = await leadRepo.count({
      where: [{ status: 'pending' }, { status: 'delivered' }],
    });
    expect(active).toBe(1);
  });
});
