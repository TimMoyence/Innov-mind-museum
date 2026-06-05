/**
 * Cycle B — in-memory `ILeadRepository` stub for the use-case UNIT tests.
 *
 * The 3 capture use-cases became persist-then-notify (Cycle B, spec R1/R5): they
 * now depend on `ILeadRepository`. The integration suites
 * (`tests/integration/leads/*.persist-then-notify.test.ts`) exercise a REAL
 * Postgres-backed repo; the unit suites only need to observe that the use-case
 * persists `pending` then transitions `delivered`/`failed` and never rethrows —
 * so a tiny deterministic in-memory stub is enough (no PG, no testcontainer).
 *
 * Test discipline (CLAUDE.md §Test Discipline — DRY Factories): unit tests use
 * `makeStubLeadRepository()` rather than inlining a fake.
 */
import { makeLead } from 'tests/helpers/leads/lead.fixtures';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { InsertLeadInput, LeadDTO } from '@modules/leads/domain/lead/lead.types';

export interface StubLeadRepository extends ILeadRepository {
  /** Every row inserted via `insertPending`, in order. */
  readonly inserted: LeadDTO[];
  /** Ids passed to `markDelivered`. */
  readonly delivered: string[];
  /** `{ id, lastError }` pairs passed to `markFailed`. */
  readonly failed: { id: string; lastError: string }[];
}

let seq = 0;

/**
 * Builds a deterministic in-memory `ILeadRepository`. Each `insertPending`
 * returns a `pending` DTO with a unique uuid-shaped id and records the call so
 * the test can assert the persist-then-notify ordering and transitions.
 *
 * `findActiveByDedupKey` returns null by default (no active dedup hit); override
 * via `dedupHit` to model the B2B second-submit path (spec R15).
 */
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

    async scheduleNextAttempt(): Promise<void> {
      // No-op in the in-memory stub — backoff scheduling is exercised by the
      // real PG repo (integration suite). Unit tests assert markFailed only.
    },

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
