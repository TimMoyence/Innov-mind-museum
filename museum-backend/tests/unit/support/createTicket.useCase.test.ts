import { CreateTicketUseCase } from '@modules/support/useCase/ticket-user/createTicket.useCase';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';

// Mock the audit module — the use case imports the singleton directly
jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
  AUDIT_SUPPORT_TICKET_CREATED: 'SUPPORT_TICKET_CREATED',
}));

describe('CreateTicketUseCase', () => {
  let useCase: CreateTicketUseCase;
  let repo: InMemorySupportRepository;

  beforeEach(() => {
    repo = new InMemorySupportRepository();
    useCase = new CreateTicketUseCase(repo);
    jest.clearAllMocks();
  });

  it('creates a ticket with required fields', async () => {
    const result = await useCase.execute({
      userId: 1,
      subject: 'App crashes on login',
      description: 'When I tap login, the app crashes immediately.',
    });

    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.userId).toBe(1);
    expect(result.subject).toBe('App crashes on login');
    expect(result.description).toBe('When I tap login, the app crashes immediately.');
    expect(result.status).toBe('open');
    expect(result.priority).toBe('medium');
    expect(result.category).toBeNull();
  });

  it('creates a ticket with all optional fields', async () => {
    const result = await useCase.execute({
      userId: 2,
      subject: 'Feature request',
      description: 'Add dark mode support.',
      priority: 'high',
      category: 'feature',
    });

    expect(result.priority).toBe('high');
    expect(result.category).toBe('feature');
  });

  it('trims subject and description', async () => {
    const result = await useCase.execute({
      userId: 1,
      subject: '  Trimmed subject  ',
      description: '  Trimmed description  ',
    });

    expect(result.subject).toBe('Trimmed subject');
    expect(result.description).toBe('Trimmed description');
  });

  it('rejects empty subject', async () => {
    await expect(
      useCase.execute({ userId: 1, subject: '', description: 'desc' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects whitespace-only subject', async () => {
    await expect(
      useCase.execute({ userId: 1, subject: '   ', description: 'desc' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects subject exceeding 256 characters', async () => {
    await expect(
      useCase.execute({
        userId: 1,
        subject: 'a'.repeat(257),
        description: 'desc',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects empty description', async () => {
    await expect(
      useCase.execute({ userId: 1, subject: 'Test', description: '' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects whitespace-only description', async () => {
    await expect(
      useCase.execute({ userId: 1, subject: 'Test', description: '   ' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects description exceeding 5000 characters', async () => {
    await expect(
      useCase.execute({
        userId: 1,
        subject: 'Test',
        description: 'x'.repeat(5001),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects invalid priority', async () => {
    await expect(
      useCase.execute({
        userId: 1,
        subject: 'Test',
        description: 'desc',
        priority: 'urgent',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('accepts all valid priorities', async () => {
    for (const priority of ['low', 'medium', 'high']) {
      const result = await useCase.execute({
        userId: 1,
        subject: 'Test',
        description: 'desc',
        priority,
      });
      expect(result.priority).toBe(priority);
    }
  });

  it('truncates category to 64 characters', async () => {
    const result = await useCase.execute({
      userId: 1,
      subject: 'Test',
      description: 'desc',
      category: 'c'.repeat(100),
    });

    expect(result.category).toBe('c'.repeat(64));
  });

  it('logs an audit event on creation', async () => {
    const { auditService } = jest.requireMock('@shared/audit');

    await useCase.execute({
      userId: 42,
      subject: 'Audit test',
      description: 'Testing audit',
      ip: '1.2.3.4',
      requestId: 'req-1',
    });

    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUPPORT_TICKET_CREATED',
        actorId: 42,
        targetType: 'support_ticket',
        ip: '1.2.3.4',
        requestId: 'req-1',
      }),
    );
  });
});
