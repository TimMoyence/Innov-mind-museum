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
      const input = {
        userId: 1,
        subject: 'help with login',
        description: 'description ten chars min',
        museumId: 42,
      } as CreateTicketInput;

      const dto = await repo.createTicket(input);

      const row = await ticketRepo.findOneByOrFail({ id: dto.id });
      expect((row as SupportTicket & { museumId?: number | null }).museumId).toBe(42);
    });
  });

  describe('listTickets — filters by museumId (R-C7c, BOLA guard)', () => {
    it('returns only museum-42 tickets when filters.museumId = 42', async () => {
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

      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
    });
  });
});
