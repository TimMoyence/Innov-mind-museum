import { ListReportsUseCase } from '@modules/admin/useCase/listReports.useCase';
import type { IAdminRepository } from '@modules/admin/domain/admin.repository.interface';
import { makeAdminRepo } from 'tests/helpers/admin/repo.fixtures';

const mockRepo = (overrides: Partial<IAdminRepository> = {}): IAdminRepository =>
  makeAdminRepo({
    listReports: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    ...overrides,
  });

describe('ListReportsUseCase', () => {
  it('throws for non-integer page', async () => {
    const useCase = new ListReportsUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 1.5, limit: 20 } })).rejects.toThrow(
      'page must be a positive integer',
    );
  });

  it('throws for page < 1', async () => {
    const useCase = new ListReportsUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: -1, limit: 20 } })).rejects.toThrow(
      'page must be a positive integer',
    );
  });

  it('throws for limit < 1', async () => {
    const useCase = new ListReportsUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 1, limit: 0 } })).rejects.toThrow(
      'limit must be between 1 and 100',
    );
  });

  it('throws for limit > 100', async () => {
    const useCase = new ListReportsUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 1, limit: 200 } })).rejects.toThrow(
      'limit must be between 1 and 100',
    );
  });

  it('delegates to repository with valid pagination', async () => {
    const repo = mockRepo();
    const useCase = new ListReportsUseCase(repo);
    await useCase.execute({ pagination: { page: 1, limit: 20 } });
    expect(repo.listReports).toHaveBeenCalledWith({ pagination: { page: 1, limit: 20 } });
  });

  it('passes status filter through', async () => {
    const repo = mockRepo();
    const useCase = new ListReportsUseCase(repo);
    await useCase.execute({ status: 'pending', pagination: { page: 1, limit: 10 } });
    expect(repo.listReports).toHaveBeenCalledWith({
      status: 'pending',
      pagination: { page: 1, limit: 10 },
    });
  });
});
