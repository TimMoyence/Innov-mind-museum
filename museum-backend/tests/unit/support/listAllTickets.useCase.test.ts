import { ListAllTicketsUseCase } from '@modules/support/useCase/listAllTickets.useCase';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';

describe('ListAllTicketsUseCase', () => {
  let useCase: ListAllTicketsUseCase;
  let repo: InMemorySupportRepository;

  beforeEach(() => {
    repo = new InMemorySupportRepository();
    useCase = new ListAllTicketsUseCase(repo);

    repo.seed({
      id: 't1',
      userId: 10,
      subject: 'Ticket A',
      description: 'd1',
      status: 'open',
      priority: 'low',
    });
    repo.seed({
      id: 't2',
      userId: 20,
      subject: 'Ticket B',
      description: 'd2',
      status: 'in_progress',
      priority: 'high',
    });
    repo.seed({
      id: 't3',
      userId: 30,
      subject: 'Ticket C',
      description: 'd3',
      status: 'resolved',
      priority: 'medium',
    });
  });

  it('lists all tickets across all users', async () => {
    const result = await useCase.execute({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('paginates correctly', async () => {
    const page1 = await useCase.execute({ page: 1, limit: 2 });
    const page2 = await useCase.execute({ page: 2, limit: 2 });

    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(1);
    expect(page1.totalPages).toBe(2);
  });

  it('filters by status', async () => {
    const result = await useCase.execute({ status: 'open', page: 1, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe('open');
  });

  it('filters by priority', async () => {
    const result = await useCase.execute({ priority: 'high', page: 1, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].priority).toBe('high');
  });

  it('returns empty when no tickets match filter', async () => {
    const result = await useCase.execute({ status: 'closed', page: 1, limit: 10 });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('rejects page < 1', async () => {
    await expect(useCase.execute({ page: 0, limit: 10 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects negative page', async () => {
    await expect(useCase.execute({ page: -1, limit: 10 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects non-integer page', async () => {
    await expect(useCase.execute({ page: 1.5, limit: 10 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects limit < 1', async () => {
    await expect(useCase.execute({ page: 1, limit: 0 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects limit > 100', async () => {
    await expect(useCase.execute({ page: 1, limit: 101 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects invalid status', async () => {
    await expect(useCase.execute({ status: 'pending', page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects invalid priority', async () => {
    await expect(useCase.execute({ priority: 'urgent', page: 1, limit: 10 })).rejects.toMatchObject(
      { statusCode: 400 },
    );
  });

  it('accepts all valid statuses', async () => {
    for (const status of ['open', 'in_progress', 'resolved', 'closed']) {
      await expect(useCase.execute({ status, page: 1, limit: 10 })).resolves.toBeDefined();
    }
  });

  it('accepts all valid priorities', async () => {
    for (const priority of ['low', 'medium', 'high']) {
      await expect(useCase.execute({ priority, page: 1, limit: 10 })).resolves.toBeDefined();
    }
  });
});
