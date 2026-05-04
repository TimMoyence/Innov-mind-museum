import { ListAuditLogsUseCase } from '@modules/admin/useCase/audit/listAuditLogs.useCase';
import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import { makeAdminRepo } from 'tests/helpers/admin/repo.fixtures';

const mockRepo = (overrides: Partial<IAdminRepository> = {}): IAdminRepository =>
  makeAdminRepo({
    listAuditLogs: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    ...overrides,
  });

describe('ListAuditLogsUseCase', () => {
  it('throws for non-integer page', async () => {
    const useCase = new ListAuditLogsUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 1.5, limit: 20 } })).rejects.toThrow(
      'page must be a positive integer',
    );
  });

  it('throws for page < 1', async () => {
    const useCase = new ListAuditLogsUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 0, limit: 20 } })).rejects.toThrow(
      'page must be a positive integer',
    );
  });

  it('throws for non-integer limit', async () => {
    const useCase = new ListAuditLogsUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 1, limit: 1.5 } })).rejects.toThrow(
      'limit must be between 1 and 100',
    );
  });

  it('throws for limit < 1', async () => {
    const useCase = new ListAuditLogsUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 1, limit: 0 } })).rejects.toThrow(
      'limit must be between 1 and 100',
    );
  });

  it('throws for limit > 100', async () => {
    const useCase = new ListAuditLogsUseCase(mockRepo());
    await expect(useCase.execute({ pagination: { page: 1, limit: 101 } })).rejects.toThrow(
      'limit must be between 1 and 100',
    );
  });

  it('delegates to repository with valid pagination', async () => {
    const repo = mockRepo();
    const useCase = new ListAuditLogsUseCase(repo);
    await useCase.execute({ pagination: { page: 1, limit: 20 } });
    expect(repo.listAuditLogs).toHaveBeenCalledWith({ pagination: { page: 1, limit: 20 } });
  });

  it('passes optional filters through', async () => {
    const repo = mockRepo();
    const useCase = new ListAuditLogsUseCase(repo);
    await useCase.execute({
      action: 'AUTH_LOGIN_SUCCESS',
      actorId: 5,
      pagination: { page: 2, limit: 10 },
    });
    expect(repo.listAuditLogs).toHaveBeenCalledWith({
      action: 'AUTH_LOGIN_SUCCESS',
      actorId: 5,
      pagination: { page: 2, limit: 10 },
    });
  });
});
