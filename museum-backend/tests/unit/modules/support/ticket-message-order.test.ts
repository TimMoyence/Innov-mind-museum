import { AddTicketMessageUseCase } from '@modules/support/useCase/ticket-user/addTicketMessage.useCase';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';

describe('ORDRE · answering a ticket refuses a too long text before looking the ticket up', () => {
  const tooLong = 'x'.repeat(2001);

  const answer = (repository: InMemorySupportRepository, ticketId: string, text: string) =>
    new AddTicketMessageUseCase(repository).execute({
      ticketId,
      senderId: 5,
      senderRole: 'visitor',
      text,
    });

  it.each([
    ['a missing ticket', 'missing'],
    ['the ticket of someone else', 'other'],
  ])('ORDRE · %s with a too long text is a 400', async (_case, ticketId) => {
    const repository = new InMemorySupportRepository();
    repository.seed({ id: 'other', userId: 42, subject: 'Help', description: 'Need help' });

    await expect(answer(repository, ticketId, tooLong)).rejects.toMatchObject({
      statusCode: 400,
      message: 'text must be between 1 and 2000 characters',
    });
  });

  it('ORDRE · a missing ticket comes before the access check', async () => {
    await expect(answer(new InMemorySupportRepository(), 'missing', 'Hello')).rejects.toMatchObject(
      { statusCode: 404 },
    );
  });

  it('ORDRE · the ticket of someone else is a 403 and stays without message', async () => {
    const repository = new InMemorySupportRepository();
    repository.seed({ id: 'other', userId: 42, subject: 'Help', description: 'Need help' });

    await expect(answer(repository, 'other', 'Hello')).rejects.toMatchObject({ statusCode: 403 });
    expect((await repository.getTicketById('other'))?.messages).toEqual([]);
  });
});
