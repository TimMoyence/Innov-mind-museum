import type { InsertLeadInput, LeadDTO } from '@modules/leads/domain/lead/lead.types';

/**
 * Domain port for persisting + recovering leads (design §3). The PG adapter
 * (`adapters/secondary/pg/lead.repository.pg.ts`) implements this; use-cases
 * depend on the port, never the adapter (hexagonal).
 */
export interface ILeadRepository {
  /** Insert a `pending` lead. Returns the DTO (with generated id). R1. */
  insertPending(input: InsertLeadInput): Promise<LeadDTO>;

  /** pending → delivered + deliveredAt=NOW + attempts incremented. R2. */
  markDelivered(id: string): Promise<void>;

  /**
   * → failed + attempts++ + lastError (sliced, NO api-key, NO extra PII).
   * R3/R11.
   */
  markFailed(id: string, lastError: string): Promise<void>;

  /**
   * Applicative backoff (R11): set the row's `nextEligibleAt` so the retry job
   * does not re-select it before the backoff window elapses. Called by the
   * retry use-case AFTER `markFailed`; the capture use-cases leave it null (a
   * first failure is immediately eligible). `null` clears it (back to eligible).
   */
  scheduleNextAttempt(id: string, nextEligibleAtIso: string | null): Promise<void>;

  /**
   * Select status IN ('pending','failed') AND attempts < maxAttempts AND
   * nextEligibleAt <= NOW (or null), ordered by nextEligibleAt/createdAt ASC,
   * LIMIT batchLimit. Never selects `delivered`. R8/R10/R11.
   */
  selectRedeliverable(maxAttempts: number, batchLimit: number): Promise<LeadDTO[]>;

  /**
   * B2B dedup: returns an active (pending|delivered) lead with this dedupKey,
   * else null. `failed` is NOT a dedup block (we want to re-deliver it). R15.
   */
  findActiveByDedupKey(dedupKey: string): Promise<LeadDTO | null>;

  /**
   * Retention: hard-delete `delivered` leads older than cutoff (bounded batch).
   * Returns the number of rows deleted. NFR Privacy(a).
   */
  purgeDeliveredOlderThan(cutoffIso: string, batchLimit: number): Promise<number>;

  /**
   * GDPR Art.17 (R20 — couplage WS-D D4): purge every lead whose stored email
   * matches the normalised email, all statuses. Returns rows deleted.
   */
  deleteByEmail(emailNormalized: string): Promise<number>;
}
