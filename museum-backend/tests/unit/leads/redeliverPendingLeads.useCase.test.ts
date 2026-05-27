/**
 * T5.1 (RED — Cycle B « Aucun lead perdu », Phase 5 — UFR-022 fresh-context red).
 *
 * Unit-level selection/transition contract for the async retry use-case
 * `RedeliverPendingLeadsUseCase` (spec R8/R9/R10/R11, design §3). The repo and
 * the per-type notifier resolver are mocked, so the test is HANDLER-PURE: no
 * BullMQ Queue/Worker is instantiated (lib-docs/bullmq/LESSONS — instantiating a
 * Worker here would leak an ioredis TCP handle and hang the Jest worker; the
 * scheduled-job wiring is verified separately by the registrar, not here).
 *
 * Asserted:
 *   (a) R8 — eligible `pending`/`failed` leads are re-notified through the
 *       resolver matching their `type` and marked `delivered`; the batch limit
 *       is forwarded to `selectRedeliverable`.
 *   (b) R9 — idempotent: the handler ONLY acts on what `selectRedeliverable`
 *       returns (which never includes `delivered`); a `delivered` lead is never
 *       re-notified.
 *   (c) R10 — the configured `maxAttempts` cap is forwarded to
 *       `selectRedeliverable` (terminal `failed` leads are excluded at the query).
 *   (d) R11 — when re-delivery throws again, the lead is `markFailed` (attempts
 *       increment + backoff handled by the repo/SQL), never `markDelivered`.
 *   (e) the handler returns a `ScheduledJobResult` with `rowsAffected`.
 *
 * RED reason: `src/modules/leads/useCase/redeliverPendingLeads.useCase.ts` does
 * NOT exist yet (the green phase T5.2 adds it). The import below fails to
 * resolve → the suite errors → exit ≠ 0. The failure is precisely "no retry
 * use-case", not a scaffolding gap (entity/repo/port/factory all exist).
 *
 * Maps: R8, R9, R10, R11.
 *
 * Test discipline — leads built via `makeLead()`; repository double via the
 * shared `makeStubLeadRepository()` factory, extended per-test for the retry
 * selection. No inline entity literals.
 */
import { makeLead } from '../../helpers/leads/lead.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { LeadDTO, LeadType } from '@modules/leads/domain/lead/lead.types';
import type { ScheduledJobResult } from '@shared/queue/scheduled-jobs';

/**
 * Compile-time shim for the GREEN target the green phase (T5.2) will add. The
 * class does NOT exist yet — resolved at RUNTIME via the require below, which
 * throws (module-not-found) so the failure is behavioural absence-of-feature,
 * NOT a pure tsc gap. This shim only pins the constructor surface (repo +
 * per-type notifier resolver + config) that design §3 specifies.
 */
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

// RUNTIME resolution — throws `Cannot find module` until T5.2 creates the file.
const { RedeliverPendingLeadsUseCase } =
  require('@modules/leads/useCase/redeliverPendingLeads.useCase') as {
    RedeliverPendingLeadsUseCase: RedeliverPendingLeadsUseCaseCtor;
  };

/** Per-type notifier resolver double (mirror `leadNotifierByType`, useCase/index.ts). */
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
    // selectRedeliverable already excludes delivered; the handler must not look
    // anywhere else. With nothing eligible, no notify / no transition happens.
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
