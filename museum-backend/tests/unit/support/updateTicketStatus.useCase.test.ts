import { UpdateTicketStatusUseCase } from '@modules/support/useCase/updateTicketStatus.useCase';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';

// Mock the audit module — the use case imports the singleton directly
jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
  AUDIT_ADMIN_TICKET_UPDATED: 'ADMIN_TICKET_UPDATED',
}));

describe('UpdateTicketStatusUseCase', () => {
  let useCase: UpdateTicketStatusUseCase;
  let repo: InMemorySupportRepository;
  let ticketId: string;

  beforeEach(() => {
    repo = new InMemorySupportRepository();
    useCase = new UpdateTicketStatusUseCase(repo);

    const seeded = repo.seed({
      id: 'ticket-upd-1',
      userId: 10,
      subject: 'Update test',
      description: 'Testing updates',
      status: 'open',
      priority: 'medium',
    });
    ticketId = seeded.id;
    jest.clearAllMocks();
  });

  it('updates ticket status', async () => {
    const result = await useCase.execute({
      ticketId,
      status: 'in_progress',
      actorId: 1,
    });

    expect(result.status).toBe('in_progress');
  });

  it('updates ticket priority', async () => {
    const result = await useCase.execute({
      ticketId,
      priority: 'high',
      actorId: 1,
    });

    expect(result.priority).toBe('high');
  });

  it('assigns ticket to a user', async () => {
    const result = await useCase.execute({
      ticketId,
      assignedTo: 42,
      actorId: 1,
    });

    expect(result.assignedTo).toBe(42);
  });

  it('unassigns ticket (set assignedTo to null)', async () => {
    // First assign
    await useCase.execute({ ticketId, assignedTo: 42, actorId: 1 });

    // Then unassign
    const result = await useCase.execute({
      ticketId,
      assignedTo: null,
      actorId: 1,
    });

    expect(result.assignedTo).toBeNull();
  });

  it('updates multiple fields at once', async () => {
    const result = await useCase.execute({
      ticketId,
      status: 'resolved',
      priority: 'low',
      assignedTo: 5,
      actorId: 1,
    });

    expect(result.status).toBe('resolved');
    expect(result.priority).toBe('low');
    expect(result.assignedTo).toBe(5);
  });

  it('rejects invalid status', async () => {
    await expect(
      useCase.execute({ ticketId, status: 'invalid', actorId: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects invalid priority', async () => {
    await expect(
      useCase.execute({ ticketId, priority: 'critical', actorId: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when no update fields provided', async () => {
    await expect(
      useCase.execute({ ticketId, actorId: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when ticket not found', async () => {
    await expect(
      useCase.execute({
        ticketId: 'non-existent',
        status: 'closed',
        actorId: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('logs an audit event on update', async () => {
    const { auditService } = jest.requireMock('@shared/audit');

    await useCase.execute({
      ticketId,
      status: 'closed',
      actorId: 5,
      ip: '10.0.0.1',
      requestId: 'req-42',
    });

    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_TICKET_UPDATED',
        actorId: 5,
        targetType: 'support_ticket',
        targetId: ticketId,
        ip: '10.0.0.1',
        requestId: 'req-42',
        metadata: expect.objectContaining({ status: 'closed' }),
      }),
    );
  });

  it('includes only changed fields in audit metadata', async () => {
    const { auditService } = jest.requireMock('@shared/audit');

    await useCase.execute({
      ticketId,
      priority: 'high',
      actorId: 1,
    });

    const logCall = auditService.log.mock.calls[0][0];
    expect(logCall.metadata).toEqual({ priority: 'high' });
    expect(logCall.metadata.status).toBeUndefined();
  });

  it('accepts all valid statuses', async () => {
    for (const status of ['open', 'in_progress', 'resolved', 'closed']) {
      const result = await useCase.execute({ ticketId, status, actorId: 1 });
      expect(result.status).toBe(status);
    }
  });

  it('accepts all valid priorities', async () => {
    for (const priority of ['low', 'medium', 'high']) {
      const result = await useCase.execute({ ticketId, priority, actorId: 1 });
      expect(result.priority).toBe(priority);
    }
  });
});
