import { AddTicketMessageUseCase } from '@modules/support/useCase/ticket-user/addTicketMessage.useCase';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';

describe('AddTicketMessageUseCase', () => {
  let useCase: AddTicketMessageUseCase;
  let repo: InMemorySupportRepository;
  let ticketId: string;

  beforeEach(() => {
    repo = new InMemorySupportRepository();
    useCase = new AddTicketMessageUseCase(repo);

    const seeded = repo.seed({
      id: 'ticket-msg-1',
      userId: 10,
      subject: 'Test ticket',
      description: 'Description',
      status: 'open',
    });
    ticketId = seeded.id;
  });

  it('adds a message from the ticket owner', async () => {
    const result = await useCase.execute({
      ticketId,
      senderId: 10,
      senderRole: 'user',
      text: 'Hello, I need help',
    });

    expect(result.ticketId).toBe(ticketId);
    expect(result.senderId).toBe(10);
    expect(result.senderRole).toBe('user');
    expect(result.text).toBe('Hello, I need help');
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
    expect(new Date(result.createdAt).getTime()).not.toBeNaN();
  });

  it('adds a message from an admin (non-owner)', async () => {
    const result = await useCase.execute({
      ticketId,
      senderId: 99,
      senderRole: 'admin',
      text: 'We are looking into it',
    });

    expect(result.senderId).toBe(99);
    expect(result.senderRole).toBe('admin');
  });

  it('adds a message from a moderator', async () => {
    const result = await useCase.execute({
      ticketId,
      senderId: 88,
      senderRole: 'moderator',
      text: 'Noted, escalating',
    });

    expect(result.senderRole).toBe('moderator');
  });

  it('auto-transitions open ticket to in_progress when admin replies', async () => {
    await useCase.execute({
      ticketId,
      senderId: 99,
      senderRole: 'admin',
      text: 'Admin reply',
    });

    const detail = await repo.getTicketById(ticketId);
    expect(detail!.status).toBe('in_progress');
  });

  it('auto-transitions open ticket to in_progress when moderator replies', async () => {
    await useCase.execute({
      ticketId,
      senderId: 88,
      senderRole: 'moderator',
      text: 'Moderator reply',
    });

    const detail = await repo.getTicketById(ticketId);
    expect(detail!.status).toBe('in_progress');
  });

  it('does not auto-transition when user replies', async () => {
    await useCase.execute({
      ticketId,
      senderId: 10,
      senderRole: 'user',
      text: 'User follow-up',
    });

    const detail = await repo.getTicketById(ticketId);
    expect(detail!.status).toBe('open');
  });

  it('does not auto-transition when ticket is already in_progress', async () => {
    // First, transition to in_progress
    await repo.updateTicket({ ticketId, status: 'in_progress' });

    await useCase.execute({
      ticketId,
      senderId: 99,
      senderRole: 'admin',
      text: 'Another admin reply',
    });

    const detail = await repo.getTicketById(ticketId);
    expect(detail!.status).toBe('in_progress');
  });

  it('rejects empty text', async () => {
    await expect(
      useCase.execute({
        ticketId,
        senderId: 10,
        senderRole: 'user',
        text: '',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects whitespace-only text', async () => {
    await expect(
      useCase.execute({
        ticketId,
        senderId: 10,
        senderRole: 'user',
        text: '   ',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects text exceeding 5000 characters', async () => {
    await expect(
      useCase.execute({
        ticketId,
        senderId: 10,
        senderRole: 'user',
        text: 'x'.repeat(5001),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 403 when non-owner user tries to add message', async () => {
    await expect(
      useCase.execute({
        ticketId,
        senderId: 999,
        senderRole: 'user',
        text: 'Unauthorized message',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 when ticket not found', async () => {
    await expect(
      useCase.execute({
        ticketId: 'non-existent',
        senderId: 10,
        senderRole: 'user',
        text: 'Hello',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('trims message text', async () => {
    const result = await useCase.execute({
      ticketId,
      senderId: 10,
      senderRole: 'user',
      text: '  trimmed message  ',
    });

    expect(result.text).toBe('trimmed message');
  });
});
