import { makeLead } from 'tests/helpers/leads/lead.fixtures';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { InsertLeadInput, LeadDTO } from '@modules/leads/domain/lead/lead.types';

export interface StubLeadRepository extends ILeadRepository {
  readonly inserted: LeadDTO[];
  readonly delivered: string[];
  readonly failed: { id: string; lastError: string }[];
}

let seq = 0;

export function makeStubLeadRepository(
  opts: { dedupHit?: LeadDTO | null } = {},
): StubLeadRepository {
  const inserted: LeadDTO[] = [];
  const delivered: string[] = [];
  const failed: { id: string; lastError: string }[] = [];

  return {
    inserted,
    delivered,
    failed,

    async insertPending(input: InsertLeadInput): Promise<LeadDTO> {
      seq += 1;
      const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
      const dto = makeLead({
        id,
        type: input.type,
        status: 'pending',
        payload: input.payload,
        dedupKey: input.dedupKey ?? null,
        attempts: 0,
      });
      inserted.push(dto);
      return dto;
    },

    async markDelivered(id: string): Promise<void> {
      delivered.push(id);
    },

    async markFailed(id: string, lastError: string): Promise<void> {
      failed.push({ id, lastError });
    },

    async scheduleNextAttempt(): Promise<void> {},

    async selectRedeliverable(): Promise<LeadDTO[]> {
      return [];
    },

    async findActiveByDedupKey(): Promise<LeadDTO | null> {
      return opts.dedupHit ?? null;
    },

    async purgeDeliveredOlderThan(): Promise<number> {
      return 0;
    },

    async deleteByEmail(): Promise<number> {
      return 0;
    },
  };
}
