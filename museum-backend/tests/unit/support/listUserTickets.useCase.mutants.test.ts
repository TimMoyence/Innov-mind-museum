import { ListUserTicketsUseCase } from '@modules/support/useCase/ticket-user/listUserTickets.useCase';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@modules/support/domain/ticket/support.types';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';
import { makeTicket } from 'tests/helpers/support/ticket.fixtures';

describe('ListUserTicketsUseCase — mutation kills', () => {
  let useCase: ListUserTicketsUseCase;
  let repo: InMemorySupportRepository;

  beforeEach(() => {
    repo = new InMemorySupportRepository();
    useCase = new ListUserTicketsUseCase(repo);
    repo.seed(
      makeTicket({
        id: 't1',
        userId: 10,
        subject: 'Ticket 1',
        description: 'd1',
        status: 'open',
        priority: 'low',
      }),
    );
  });

  describe('limit boundary (L31:43)', () => {
    it('accepts limit = 1 (kills `<` → `<=`)', async () => {
      const result = await useCase.execute({ userId: 10, page: 1, limit: 1 });

      expect(result.limit).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('rejects limit = 0 (verifies the `< 1` guard is still active)', async () => {
      await expect(useCase.execute({ userId: 10, page: 1, limit: 0 })).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('limit upper boundary (L31:62)', () => {
    it('accepts limit = 100 (kills `>` → `>=`)', async () => {
      const result = await useCase.execute({ userId: 10, page: 1, limit: 100 });

      expect(result.limit).toBe(100);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('limit error message (L32:24)', () => {
    it('throws with the exact "limit must be between 1 and 100" message when limit = 0', async () => {
      await expect(useCase.execute({ userId: 10, page: 1, limit: 0 })).rejects.toMatchObject({
        statusCode: 400,
        message: 'limit must be between 1 and 100',
      });
    });

    it('throws with the exact "limit must be between 1 and 100" message when limit = 101', async () => {
      await expect(useCase.execute({ userId: 10, page: 1, limit: 101 })).rejects.toMatchObject({
        statusCode: 400,
        message: 'limit must be between 1 and 100',
      });
    });

    it('throws with the exact "limit must be between 1 and 100" message when limit is not an integer', async () => {
      await expect(useCase.execute({ userId: 10, page: 1, limit: 1.5 })).rejects.toMatchObject({
        statusCode: 400,
        message: 'limit must be between 1 and 100',
      });
    });
  });

  describe('priority error message (L39)', () => {
    it('throws with the exact rendered "priority must be one of: low, medium, high" message (kills both StringLiteral mutants)', async () => {
      const expected = `priority must be one of: ${TICKET_PRIORITIES.join(', ')}`;
      expect(expected).toBe('priority must be one of: low, medium, high');

      await expect(
        useCase.execute({ userId: 10, priority: 'critical', page: 1, limit: 10 }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expected,
      });
    });

    it('renders the priority list with the literal comma-space separator between values (kills join separator empty-string mutant)', async () => {
      try {
        await useCase.execute({ userId: 10, priority: 'urgent', page: 1, limit: 10 });
        throw new Error('expected execute() to reject for invalid priority');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg.startsWith('priority must be one of: ')).toBe(true);
        expect(msg).toContain('low, medium');
        for (const p of TICKET_PRIORITIES) {
          expect(msg).toContain(p);
        }
      }
    });
  });

  it('throws the canonical status enum message for an invalid status', async () => {
    const expected = `status must be one of: ${TICKET_STATUSES.join(', ')}`;
    await expect(
      useCase.execute({ userId: 10, status: 'archived', page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expected,
    });
  });
});
