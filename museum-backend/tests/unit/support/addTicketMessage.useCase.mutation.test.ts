/**
 * Mutation-coverage tests for AddTicketMessageUseCase.
 *
 * Targets 3 Stryker survivors in
 * `src/modules/support/useCase/ticket-user/addTicketMessage.useCase.ts`:
 *  - L21:37 EqualityOperator `text.length > 2000` → `text.length >= 2000`
 *  - L22 StringLiteral (badRequest message body) → ""
 *  - L30 StringLiteral (notFound message body)   → ""
 *
 * Strategy:
 *  - Exercise the exact boundary length (2000) so the `>=` mutant flips
 *    behaviour at the edge (rejects what the original accepts).
 *  - Assert the *exact* error message text on both the badRequest and
 *    notFound paths to kill the StringLiteral → "" mutants.
 */

import { AddTicketMessageUseCase } from '@modules/support/useCase/ticket-user/addTicketMessage.useCase';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';
import { makeTicket } from 'tests/helpers/support/ticket.fixtures';

describe('AddTicketMessageUseCase — mutation coverage', () => {
  let useCase: AddTicketMessageUseCase;
  let repo: InMemorySupportRepository;
  let ticketId: string;

  beforeEach(() => {
    repo = new InMemorySupportRepository();
    useCase = new AddTicketMessageUseCase(repo);

    const seeded = repo.seed(
      makeTicket({
        id: 'ticket-msg-mut-1',
        userId: 10,
        subject: 'Mutation test',
        description: 'desc',
        status: 'open',
      }),
    );
    ticketId = seeded.id;
  });

  describe('text length boundary (L21 EqualityOperator)', () => {
    it('ACCEPTS text of exactly 2000 characters (boundary, `> 2000` not `>= 2000`)', async () => {
      const text = 'x'.repeat(2000);
      expect(text).toHaveLength(2000);

      const result = await useCase.execute({
        ticketId,
        senderId: 10,
        senderRole: 'user',
        text,
      });

      expect(result.text).toBe(text);
      expect(result.text).toHaveLength(2000);
      expect(result.ticketId).toBe(ticketId);
    });

    it('REJECTS text of 2001 characters with statusCode 400 (keeps upper-bound discipline)', async () => {
      await expect(
        useCase.execute({
          ticketId,
          senderId: 10,
          senderRole: 'user',
          text: 'x'.repeat(2001),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('error message text (L22, L30 StringLiteral)', () => {
    it('uses the exact "text must be between 1 and 2000 characters" message for empty input', async () => {
      await expect(
        useCase.execute({
          ticketId,
          senderId: 10,
          senderRole: 'user',
          text: '',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'text must be between 1 and 2000 characters',
      });
    });

    it('uses the exact "text must be between 1 and 2000 characters" message for whitespace-only input', async () => {
      await expect(
        useCase.execute({
          ticketId,
          senderId: 10,
          senderRole: 'user',
          text: '   \t  \n ',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'text must be between 1 and 2000 characters',
      });
    });

    it('uses the exact "text must be between 1 and 2000 characters" message for 2001-char input', async () => {
      await expect(
        useCase.execute({
          ticketId,
          senderId: 10,
          senderRole: 'user',
          text: 'x'.repeat(2001),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'text must be between 1 and 2000 characters',
      });
    });

    it('uses the exact "Ticket not found" message when ticket does not exist', async () => {
      await expect(
        useCase.execute({
          ticketId: 'does-not-exist',
          senderId: 10,
          senderRole: 'user',
          text: 'Hello',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Ticket not found',
      });
    });
  });
});
