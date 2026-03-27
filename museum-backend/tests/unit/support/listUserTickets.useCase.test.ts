import { ListUserTicketsUseCase } from '@modules/support/useCase/listUserTickets.useCase';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';

describe('ListUserTicketsUseCase', () => {
  let useCase: ListUserTicketsUseCase;
  let repo: InMemorySupportRepository;

  beforeEach(() => {
    repo = new InMemorySupportRepository();
    useCase = new ListUserTicketsUseCase(repo);

    // Seed tickets for user 10
    repo.seed({
      id: 't1',
      userId: 10,
      subject: 'Ticket 1',
      description: 'd1',
      status: 'open',
      priority: 'low',
    });
    repo.seed({
      id: 't2',
      userId: 10,
      subject: 'Ticket 2',
      description: 'd2',
      status: 'in_progress',
      priority: 'high',
    });
    repo.seed({
      id: 't3',
      userId: 10,
      subject: 'Ticket 3',
      description: 'd3',
      status: 'resolved',
      priority: 'medium',
    });
    // Seed ticket for another user
    repo.seed({ id: 't4', userId: 20, subject: 'Other user', description: 'd4' });
  });

  it('lists tickets for a specific user with pagination', async () => {
    const result = await useCase.execute({
      userId: 10,
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.data.every((t) => t.userId === 10)).toBe(true);
  });

  it('paginates results correctly', async () => {
    const page1 = await useCase.execute({ userId: 10, page: 1, limit: 2 });
    const page2 = await useCase.execute({ userId: 10, page: 2, limit: 2 });

    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(1);
    expect(page1.totalPages).toBe(2);
  });

  it('filters by status', async () => {
    const result = await useCase.execute({
      userId: 10,
      status: 'open',
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe('open');
  });

  it('filters by priority', async () => {
    const result = await useCase.execute({
      userId: 10,
      priority: 'high',
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].priority).toBe('high');
  });

  it('returns empty data when user has no tickets', async () => {
    const result = await useCase.execute({
      userId: 999,
      page: 1,
      limit: 10,
    });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('rejects page < 1', async () => {
    await expect(useCase.execute({ userId: 10, page: 0, limit: 10 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects negative page', async () => {
    await expect(useCase.execute({ userId: 10, page: -1, limit: 10 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects non-integer page', async () => {
    await expect(useCase.execute({ userId: 10, page: 1.5, limit: 10 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects limit < 1', async () => {
    await expect(useCase.execute({ userId: 10, page: 1, limit: 0 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects limit > 100', async () => {
    await expect(useCase.execute({ userId: 10, page: 1, limit: 101 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects invalid status', async () => {
    await expect(
      useCase.execute({ userId: 10, status: 'invalid', page: 1, limit: 10 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects invalid priority', async () => {
    await expect(
      useCase.execute({ userId: 10, priority: 'critical', page: 1, limit: 10 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('accepts all valid statuses', async () => {
    for (const status of ['open', 'in_progress', 'resolved', 'closed']) {
      await expect(
        useCase.execute({ userId: 10, status, page: 1, limit: 10 }),
      ).resolves.toBeDefined();
    }
  });

  it('accepts all valid priorities', async () => {
    for (const priority of ['low', 'medium', 'high']) {
      await expect(
        useCase.execute({ userId: 10, priority, page: 1, limit: 10 }),
      ).resolves.toBeDefined();
    }
  });
});
