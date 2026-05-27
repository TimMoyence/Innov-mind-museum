import { leadNotifierByType } from '@modules/leads/useCase';
import { RedeliverPendingLeadsUseCase } from '@modules/leads/useCase/redeliverPendingLeads.useCase';
import { registerScheduledJob, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { LeadDeliveryNotifier } from '@modules/leads/useCase/redeliverPendingLeads.useCase';
import type { ConnectionOptions } from 'bullmq';

export interface LeadsRedeliveryCronConfig {
  connection: ConnectionOptions;
  /** Cron pattern (env default: every 5 minutes). */
  cronPattern: string;
  /** Terminal attempts cap (R10). */
  maxAttempts: number;
  /** Bounded batch per tick (R8). */
  batchLimit: number;
  /** Retention window for the in-handler `delivered` purge (D6). */
  retentionDays: number;
  /** Backoff base / cap (R11). */
  backoffBaseMs: number;
  backoffCapMs: number;
}

/**
 * Cycle B (« Aucun lead perdu », T5.3) — thin wrapper around
 * {@link registerScheduledJob} (mirror `support-retention-cron.registrar.ts`).
 * All business logic lives in {@link RedeliverPendingLeadsUseCase} (handler-pure)
 * — the registrar only owns the BullMQ scheduling.
 *
 * Queue/job name `leads-redelivery` has NO colon (lib-docs/bullmq/LESSONS.md:42-47
 * — colons conflict with Redis key conventions). It inherits the shared
 * infra's hardening from `scheduled-jobs.ts`: `upsertJobScheduler` (idempotent
 * reboot, one tick per cron beat across replicas), `removeOnComplete:100` /
 * `removeOnFail:500`, `worker.on('error')` → Sentry, `concurrency:1`, and a
 * teardown that awaits `worker.close()` + `queue.close()` (SIGTERM,
 * lib-docs/bullmq/LESSONS.md:11-14).
 */
export function registerLeadsRedeliveryCron(
  repository: ILeadRepository,
  cfg: LeadsRedeliveryCronConfig,
): ScheduledJobHandle {
  const useCase = new RedeliverPendingLeadsUseCase(
    repository,
    (type) => leadNotifierByType(type) as LeadDeliveryNotifier,
    {
      maxAttempts: cfg.maxAttempts,
      batchLimit: cfg.batchLimit,
      retentionDays: cfg.retentionDays,
      backoffBaseMs: cfg.backoffBaseMs,
      backoffCapMs: cfg.backoffCapMs,
    },
  );

  return registerScheduledJob({
    name: 'leads-redelivery',
    cronPattern: cfg.cronPattern,
    connection: cfg.connection,
    handler: async () => await useCase.execute(),
  });
}
