/**
 * Cycle B (« Aucun lead perdu », T5.2 — Phase 5) — async redelivery handler.
 *
 * Re-delivers the leads that the capture path persisted but could not deliver
 * to Brevo (status `pending`/`failed`), so a Brevo runtime incident never loses
 * a lead (spec R8/R9/R10/R11, design §3/§9 D1/D6).
 *
 * HANDLER-PURE — signature `() => Promise<ScheduledJobResult>`, compatible with
 * `@shared/queue/scheduled-jobs.ts`. It instantiates NO BullMQ Queue/Worker
 * (that is the registrar's concern, `leads-redelivery-cron.registrar.ts`); this
 * keeps the use-case unit-/integration-testable without leaking an ioredis
 * handle (lib-docs/bullmq/LESSONS — a Worker in a test hangs the Jest worker).
 *
 * Idempotence (R9): the handler ONLY acts on what `selectRedeliverable` returns,
 * and that query never includes `delivered` rows nor rows over the attempts cap
 * (R10) nor rows whose `nextEligibleAt` is still in the future (R11 backoff). So
 * a `delivered` lead is never re-notified, and a second tick does not
 * double-deliver. The BullMQ scheduler guarantees one tick per cron beat across
 * replicas (design §9 D1) — no application lock needed.
 *
 * Backoff (R11): on a repeated failure the next eligible time is pushed to
 * `NOW + min(2^attempts * base, cap)` with light ±10 % jitter. There is no
 * BullMQ-native `jitter` on the pinned 5.74.1 (lib-docs/bullmq/LESSONS.md:49-53),
 * so the jitter is applicative.
 *
 * Retention (D6): the same handler purges `delivered` leads older than the
 * retention window (NFR Privacy(a)) — one scheduled job, not two (KISS).
 */
import { toSanitizedLeadError } from '@modules/leads/domain/lead/sanitizeLeadError';
import { logger } from '@shared/logger/logger';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { LeadDTO, LeadType } from '@modules/leads/domain/lead/lead.types';
import type { ScheduledJobResult } from '@shared/queue/scheduled-jobs';

/** The two notifier shapes a resolver can hand back (mirror `leadNotifierByType`). */
export type LeadDeliveryNotifier =
  | { notify: (payload: never) => Promise<void> }
  | { subscribe: (payload: never) => Promise<unknown> };

/** Resolves the live notifier path for a lead by its `type`. */
export type LeadNotifierResolver = (type: LeadType) => LeadDeliveryNotifier;

export interface RedeliverPendingLeadsConfig {
  /** Terminal cap (R10): rows at `attempts >= maxAttempts` are not selected. */
  maxAttempts: number;
  /** Bounded batch per tick (R8). */
  batchLimit: number;
  /** Retention window for `delivered` purge (D6, NFR Privacy(a)). */
  retentionDays: number;
  /** Backoff base (R11): first re-failure delay before exponential growth. */
  backoffBaseMs: number;
  /** Backoff ceiling (R11): exponential growth is clamped here. */
  backoffCapMs: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const JITTER_FRACTION = 0.1;

/** `NOW + min(2^attempts * base, cap)` with ±10 % applicative jitter (R11). */
function computeNextEligibleAt(attempts: number, baseMs: number, capMs: number): string {
  const exponential = baseMs * 2 ** Math.max(0, attempts - 1);
  const bounded = Math.min(exponential, capMs);
  // eslint-disable-next-line sonarjs/pseudo-random -- jitter for retry backoff, not security-sensitive
  const jitter = bounded * JITTER_FRACTION * (Math.random() * 2 - 1);
  const delay = Math.max(0, Math.round(bounded + jitter));
  return new Date(Date.now() + delay).toISOString();
}

/** Dispatches a lead through its resolved notifier (`notify` for b2b, else `subscribe`). */
async function deliver(notifier: LeadDeliveryNotifier, lead: LeadDTO): Promise<void> {
  if ('notify' in notifier) {
    await notifier.notify(lead.payload as never);
    return;
  }
  await notifier.subscribe(lead.payload as never);
}

export class RedeliverPendingLeadsUseCase {
  constructor(
    private readonly repository: ILeadRepository,
    private readonly resolveNotifier: LeadNotifierResolver,
    private readonly config: RedeliverPendingLeadsConfig,
  ) {}

  async execute(): Promise<ScheduledJobResult> {
    const { maxAttempts, batchLimit, retentionDays, backoffBaseMs, backoffCapMs } = this.config;

    const eligible = await this.repository.selectRedeliverable(maxAttempts, batchLimit);
    logger.info('lead_redelivery_started', { batchSize: eligible.length });

    let delivered = 0;
    let stillFailed = 0;

    for (const lead of eligible) {
      try {
        await deliver(this.resolveNotifier(lead.type), lead);
        // R8 — delivery confirmed → delivered (clears it from future selection).
        await this.repository.markDelivered(lead.id);
        delivered += 1;
        logger.info('lead_delivered', { leadId: lead.id, type: lead.type, via: 'redelivery' });
      } catch (err) {
        // R11 — re-failure: failed + attempts++ (markFailed), then push the next
        // eligible time out by the exponential backoff so we don't hammer Brevo.
        // markFailed increments attempts → backoff keyed on the post-increment count.
        // R16 — sanitise (no api-key, no full recipient email) before persisting.
        await this.repository.markFailed(lead.id, toSanitizedLeadError(err));
        await this.repository.scheduleNextAttempt(
          lead.id,
          computeNextEligibleAt(lead.attempts + 1, backoffBaseMs, backoffCapMs),
        );
        stillFailed += 1;
        logger.warn('lead_delivery_failed', {
          leadId: lead.id,
          type: lead.type,
          via: 'redelivery',
          errorClass: err instanceof Error ? err.name : 'unknown',
        });
      }
    }

    // D6 — retention purge in the same handler (one scheduled job, KISS).
    const cutoffIso = new Date(Date.now() - retentionDays * MS_PER_DAY).toISOString();
    const purged = await this.repository.purgeDeliveredOlderThan(cutoffIso, batchLimit);

    logger.info('lead_redelivery_completed', { delivered, stillFailed, purged });

    return {
      rowsAffected: delivered + stillFailed,
      details: { delivered, stillFailed, purged },
    };
  }
}
