import { SubmitSupportContactUseCase } from '@modules/support/useCase/contact/submitSupportContact.useCase';
import { AddTicketMessageUseCase } from '@modules/support/useCase/ticket-user/addTicketMessage.useCase';
import { CreateTicketUseCase } from '@modules/support/useCase/ticket-user/createTicket.useCase';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';
import { makeSupportContactInput } from 'tests/helpers/support/supportContact.fixtures';
import { makeTicket } from 'tests/helpers/support/ticket.fixtures';

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn(), logActorAction: jest.fn() },
  AUDIT_SUPPORT_TICKET_CREATED: 'SUPPORT_TICKET_CREATED',
}));

const EMOJI = '🏛';

describe('L3 · les cas d’usage du support comptent les longueurs comme la route', () => {
  let repo: InMemorySupportRepository;

  beforeEach(() => {
    repo = new InMemorySupportRepository();
  });

  it('ticket : un sujet de 200 emoji est créé, 201 sont refusés', async () => {
    const useCase = new CreateTicketUseCase(repo);

    await expect(
      useCase.execute({ userId: 10, subject: EMOJI.repeat(200), description: 'Long enough text' }),
    ).resolves.toEqual(expect.objectContaining({ subject: EMOJI.repeat(200) }));
    await expect(
      useCase.execute({ userId: 10, subject: EMOJI.repeat(201), description: 'Long enough text' }),
    ).rejects.toThrow('subject must be between 3 and 200 characters');
  });

  it('ticket : une description de 9 caractères est refusée, comme à la route', async () => {
    await expect(
      new CreateTicketUseCase(repo).execute({
        userId: 10,
        subject: 'Login issue',
        description: 'Too short',
      }),
    ).rejects.toThrow('description must be between 10 and 5000 characters');
  });

  it('ticket : une catégorie de 65 caractères est refusée au lieu d’être tronquée', async () => {
    await expect(
      new CreateTicketUseCase(repo).execute({
        userId: 10,
        subject: 'Login issue',
        description: 'Long enough text',
        category: 'c'.repeat(65),
      }),
    ).rejects.toThrow('category must be at most 64 characters');
  });

  it('réponse : 2 000 emoji sont ajoutés, 2 001 sont refusés', async () => {
    const ticket = repo.seed(makeTicket({ id: 'ticket-limits', userId: 10 }));
    const useCase = new AddTicketMessageUseCase(repo);
    const reply = (text: string) =>
      useCase.execute({ ticketId: ticket.id, senderId: 10, senderRole: 'visitor', text });

    await expect(reply(EMOJI.repeat(2000))).resolves.toEqual(
      expect.objectContaining({ text: EMOJI.repeat(2000) }),
    );
    await expect(reply(EMOJI.repeat(2001))).rejects.toThrow(
      'text must be between 1 and 2000 characters',
    );
  });

  it('contact : un nom de 120 emoji part', async () => {
    const notify = jest.fn().mockResolvedValue(undefined);

    await new SubmitSupportContactUseCase({ notify }).execute(
      makeSupportContactInput({ name: EMOJI.repeat(120) }),
    );

    expect(notify).toHaveBeenCalledTimes(1);
  });
});
