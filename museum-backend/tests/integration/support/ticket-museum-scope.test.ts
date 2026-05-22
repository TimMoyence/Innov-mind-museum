/**
 * T-B4 (RED — Wave B / C7 — UFR-022 fresh-context red phase 2026-05-21).
 *
 * Pins the multi-tenant scope contract for `SupportRepositoryPg.createTicket`
 * + `listTickets` :
 *
 *   (a) `createTicket({ ..., museumId: 42 })` persists `museum_id = 42` on
 *       the row.
 *   (b) `listTickets({ museumId: 42 })` returns ONLY tickets belonging to
 *       museum 42 (cross-tenant tickets MUST NOT leak — OWASP API3 / BOLA).
 *   (c) `listTickets({ museumId: 99 })` from the user-context of museum 42
 *       returns 0 rows (no cross-museum read).
 *
 * Spec : `team-state/2026-05-21-p0-feature-gates/spec.md` R-C7a (museum_id col)
 * + R-C7c (scope reads/updates) + `design.md` §3 Vague B C7 + `tasks.md` T-B4.
 *
 * Baseline (HEAD `89d2d7b44`) :
 *   - `support.types.ts:9-16` `CreateTicketInput` has NO `museumId` field.
 *   - `supportTicket.entity.ts:10-42` has NO `museumId` column.
 *   - `ListTicketsFilters` (`support.types.ts:33-38`) has NO `museumId`.
 *   - `SupportRepositoryPg.createTicket:55-65` does not set museumId.
 *   - `SupportRepositoryPg.listTickets:67-83` does not filter by museumId.
 *
 * Expected red failure modes :
 *   - TypeScript compile error (object literal `{ museumId: 42 }` not
 *     assignable to `CreateTicketInput` / `ListTicketsFilters`).
 *   - At runtime (if compile suppressed): the persisted row has no
 *     `museum_id` column → `information_schema` check fails → migration M3
 *     missing (covered by T-B2).
 *
 * Either path satisfies the red phase per UFR-022.
 *
 * Test discipline (CLAUDE.md §Test Discipline) :
 *   - `tests/helpers/support/ticket.fixtures.ts` only models the entity-shape
 *     for unit tests. This integration test goes through the real
 *     `SupportRepositoryPg` (the entity rows are created via the repo's
 *     own `create()` path), so no inline entity creation in this file.
 *   - `harness.scheduleStop()` (not `harness.stop()`) — CLAUDE.md
 *     `feedback_integration_test_teardown.md`.
 *
 * Why integration (real PG, not in-memory) :
 *   The contract being pinned is the SQL persistence + filter shape on a
 *   real Postgres. `InMemorySupportRepository` (tests/helpers/support/) is
 *   a hand-rolled fake — it cannot exercise the `museum_id` column,
 *   indexed or otherwise, that M3 will add. Mirror of
 *   `tests/integration/retention/prune-support-tickets.integration.test.ts`
 *   pattern (real PG + scheduleStop + RUN_INTEGRATION gate).
 */
import type { Repository } from 'typeorm';

import { SupportRepositoryPg } from '@modules/support/adapters/secondary/pg/support.repository.pg';
import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type {
  CreateTicketInput,
  ListTicketsFilters,
} from '@modules/support/domain/ticket/support.types';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('SupportRepositoryPg — museum_id scope [integration, real PG]', () => {
  jest.setTimeout(180_000);

  let harness: IntegrationHarness;
  let repo: SupportRepositoryPg;
  let ticketRepo: Repository<SupportTicket>;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    repo = new SupportRepositoryPg(harness.dataSource);
    ticketRepo = harness.dataSource.getRepository(SupportTicket);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  describe('createTicket — persists museum_id (T-B4 — R-C7a / R-C7c)', () => {
    it('writes museum_id = 42 when CreateTicketInput.museumId = 42', async () => {
      // The cast forces the new field through the current `CreateTicketInput`
      // type — at green time, the type itself gains `museumId?: number`.
      // The cast prevents the TS error from blocking other test files in
      // the same suite; the runtime assertion is what fails red.
      const input = {
        userId: 1,
        subject: 'help with login',
        description: 'description ten chars min',
        museumId: 42,
      } as CreateTicketInput;

      const dto = await repo.createTicket(input);

      // Read back the raw entity to inspect the actual museum_id column —
      // the DTO shape currently has no museumId field, so the runtime DB
      // value is what we assert.
      const row = await ticketRepo.findOneByOrFail({ id: dto.id });
      // FAIL at baseline: `row.museumId` is `undefined` (column does not
      // exist on the entity per supportTicket.entity.ts:10-42).
      expect((row as SupportTicket & { museumId?: number | null }).museumId).toBe(42);
    });
  });

  describe('listTickets — filters by museumId (R-C7c, BOLA guard)', () => {
    it('returns only museum-42 tickets when filters.museumId = 42', async () => {
      // Seed two tickets across tenants. Both go through the same repo
      // create() path → forces the green impl to thread museumId through.
      await repo.createTicket({
        userId: 1,
        subject: 'museum 42 ticket',
        description: 'description ten chars min',
        museumId: 42,
      } as CreateTicketInput);
      await repo.createTicket({
        userId: 2,
        subject: 'museum 99 ticket',
        description: 'description ten chars min',
        museumId: 99,
      } as CreateTicketInput);

      const filters = {
        museumId: 42,
        pagination: { page: 1, limit: 50 },
      } as ListTicketsFilters;
      const result = await repo.listTickets(filters);

      // FAIL at baseline: museumId filter does not exist → both tickets
      // returned (total = 2, includes the 99-ticket — cross-tenant leak).
      expect(result.total).toBe(1);
      expect(result.data.map((t) => t.subject)).toEqual(['museum 42 ticket']);
    });

    it('returns 0 rows when filters.museumId = 99 and only museum-42 tickets exist (BOLA — no leak)', async () => {
      await repo.createTicket({
        userId: 1,
        subject: 'museum 42 only',
        description: 'description ten chars min',
        museumId: 42,
      } as CreateTicketInput);

      const filters = {
        museumId: 99,
        pagination: { page: 1, limit: 50 },
      } as ListTicketsFilters;
      const result = await repo.listTickets(filters);

      // FAIL at baseline: missing filter → returns the museum-42 ticket
      // even though the caller asked for museum 99 → BOLA leak.
      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
    });
  });
});
