import { ListUsersUseCase } from '@modules/admin/useCase/listUsers.useCase';
import type { IAdminRepository } from '@modules/admin/domain/admin.repository.interface';

const mockRepo = (overrides: Partial<IAdminRepository> = {}): IAdminRepository =>
  ({
    listUsers: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    ...overrides,
  }) as unknown as IAdminRepository;

describe('ListUsersUseCase', () => {
  it('throws for non-integer page', async () => {
    const useCase = new ListUsersUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 0.5, limit: 20 } })).rejects.toThrow('page must be a positive integer');
  });

  it('throws for page < 1', async () => {
    const useCase = new ListUsersUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 0, limit: 20 } })).rejects.toThrow('page must be a positive integer');
  });

  it('throws for limit > 100', async () => {
    const useCase = new ListUsersUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 1, limit: 101 } })).rejects.toThrow('limit must be between 1 and 100');
  });

  it('delegates to repository with valid pagination', async () => {
    const repo = mockRepo();
    const useCase = new ListUsersUseCase(repo);
    await useCase.execute({ pagination: { page: 1, limit: 20 } });
    expect(repo.listUsers).toHaveBeenCalledWith({
      search: undefined,
      role: undefined,
      pagination: { page: 1, limit: 20 },
    });
  });

  it('trims and truncates search string', async () => {
    const repo = mockRepo();
    const useCase = new ListUsersUseCase(repo);
    const longSearch = 'a'.repeat(250);
    await useCase.execute({ search: `  ${longSearch}  `, pagination: { page: 1, limit: 10 } });

    const calledWith = (repo.listUsers as jest.Mock).mock.calls[0][0];
    expect(calledWith.search).toHaveLength(200);
  });

  it('converts empty search to undefined', async () => {
    const repo = mockRepo();
    const useCase = new ListUsersUseCase(repo);
    await useCase.execute({ search: '   ', pagination: { page: 1, limit: 10 } });

    const calledWith = (repo.listUsers as jest.Mock).mock.calls[0][0];
    expect(calledWith.search).toBeUndefined();
  });

  it('passes role filter through', async () => {
    const repo = mockRepo();
    const useCase = new ListUsersUseCase(repo);
    await useCase.execute({ role: 'admin', pagination: { page: 1, limit: 10 } });

    const calledWith = (repo.listUsers as jest.Mock).mock.calls[0][0];
    expect(calledWith.role).toBe('admin');
  });
});
