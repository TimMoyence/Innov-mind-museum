import type { InsertLeadInput, LeadDTO } from '@modules/leads/domain/lead/lead.types';

export interface ILeadRepository {
  insertPending(input: InsertLeadInput): Promise<LeadDTO>;

  markDelivered(id: string): Promise<void>;

  markFailed(id: string, lastError: string): Promise<void>;

  scheduleNextAttempt(id: string, nextEligibleAtIso: string | null): Promise<void>;

  selectRedeliverable(maxAttempts: number, batchLimit: number): Promise<LeadDTO[]>;

  findActiveByDedupKey(dedupKey: string): Promise<LeadDTO | null>;

  purgeDeliveredOlderThan(cutoffIso: string, batchLimit: number): Promise<number>;

  deleteByEmail(emailNormalized: string): Promise<number>;
}
