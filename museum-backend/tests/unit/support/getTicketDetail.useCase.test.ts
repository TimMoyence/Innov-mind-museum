import { GetTicketDetailUseCase } from '@modules/support/useCase/getTicketDetail.useCase';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';

describe('GetTicketDetailUseCase', () => {
  let useCase: GetTicketDetailUseCase;
  let repo: InMemorySupportRepository;
  let ticketId: string;

  beforeEach(() => {
    repo = new InMemorySupportRepository();
    useCase = new GetTicketDetailUseCase(repo);

    const seeded = repo.seed({
      id: 'ticket-1',
      userId: 10,
      subject: 'Help needed',
      description: 'I need help with the app',
    });
    ticketId = seeded.id;
  });

  it('returns ticket detail for the owner', async () => {
    const result = await useCase.execute({
      ticketId,
      userId: 10,
      userRole: 'user',
    });

    expect(result.id).toBe(ticketId);
    expect(result.subject).toBe('Help needed');
    expect(result.messages).toEqual([]);
  });

  it('returns ticket detail for admin', async () => {
    const result = await useCase.execute({
      ticketId,
      userId: 99, // not the owner
      userRole: 'admin',
    });

    expect(result.id).toBe(ticketId);
  });

  it('returns ticket detail for moderator', async () => {
    const result = await useCase.execute({
      ticketId,
      userId: 88,
      userRole: 'moderator',
    });

    expect(result.id).toBe(ticketId);
  });

  it('throws 403 when non-owner user accesses ticket', async () => {
    await expect(
      useCase.execute({
        ticketId,
        userId: 999, // not the owner
        userRole: 'user',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 when ticket not found', async () => {
    await expect(
      useCase.execute({
        ticketId: 'non-existent-id',
        userId: 10,
        userRole: 'user',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('includes messages in the detail', async () => {
    await repo.addMessage({
      ticketId,
      senderId: 10,
      senderRole: 'user',
      text: 'First message',
    });
    await repo.addMessage({
      ticketId,
      senderId: 1,
      senderRole: 'admin',
      text: 'Admin reply',
    });

    const result = await useCase.execute({
      ticketId,
      userId: 10,
      userRole: 'user',
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].text).toBe('First message');
    expect(result.messages[1].text).toBe('Admin reply');
  });
});
